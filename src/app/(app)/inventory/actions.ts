"use server";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cards, inventoryItems, itemPhotos } from "@/db/schema";
import { db } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bulkEditSchema, itemEditSchema } from "@/lib/validation";
import { runAction } from "@/server/action";
import { UserError } from "@/server/inventory";

const CLOSED = ["sold", "traded"] as const;

export async function bulkEditItems(input: unknown) {
  return runAction(bulkEditSchema, input, async (d) => {
    const count = await db(async (tx) => {
      const patch: Partial<typeof inventoryItems.$inferInsert> = {};
      if (d.status) patch.status = d.status;
      if (d.location) patch.location = d.location;
      if (d.holderId) patch.holderId = d.holderId;
      if (d.markupPct !== undefined && d.markupPct !== null) {
        patch.askingMode = "markup";
        patch.markupBps = d.markupPct;
      }
      const where = and(inArray(inventoryItems.id, d.ids), notInArray(inventoryItems.status, [...CLOSED]));
      if (Object.keys(patch).length) await tx.update(inventoryItems).set(patch).where(where);
      for (const t of d.addTags ?? []) {
        await tx
          .update(inventoryItems)
          .set({ tags: sql`array(select distinct unnest(array_append(${inventoryItems.tags}, ${t.toLowerCase()})))` })
          .where(where);
      }
      for (const t of d.removeTags ?? []) {
        await tx
          .update(inventoryItems)
          .set({ tags: sql`array_remove(${inventoryItems.tags}, ${t.toLowerCase()})` })
          .where(where);
      }
      const rows = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(where);
      return rows.length;
    });
    revalidatePath("/inventory");
    return count;
  });
}

export async function updateItem(input: unknown) {
  return runAction(itemEditSchema.extend({ id: z.string().uuid() }), input, async (d) => {
    await db(async (tx) => {
      const [row] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, d.id));
      if (!row) throw new UserError("That card no longer exists.");
      const closed = (CLOSED as readonly string[]).includes(row.status);
      await tx.update(cards).set(d.card).where(eq(cards.id, row.cardId));
      const marketChanged = d.market.market !== row.marketCents;
      await tx
        .update(inventoryItems)
        .set({
          ...d.condition,
          // Sold/traded rows keep their status and quantity (they're history).
          ...(closed ? {} : { quantity: d.details.quantity, status: d.details.status }),
          location: d.details.location,
          holderId: d.details.holderId,
          tags: d.details.tags,
          notes: d.details.notes,
          purchaseCents: d.cost.purchase,
          feesCents: d.cost.fees,
          shippingCents: d.cost.shipping,
          gradingCents: d.cost.grading,
          acquiredOn: d.acquiredOn,
          askingMode: d.asking.askingMode,
          askingCents: d.asking.askingMode === "manual" ? d.asking.asking : row.askingCents,
          markupBps: d.asking.askingMode === "markup" ? d.asking.markupPct : row.markupBps,
          marketCents: d.market.market,
          marketSource: marketChanged ? (d.market.marketSource ?? "Manual") : (d.market.marketSource ?? row.marketSource),
          marketUpdatedAt: marketChanged ? (d.market.market === null ? null : new Date()) : row.marketUpdatedAt,
        })
        .where(eq(inventoryItems.id, d.id));
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${d.id}`);
    return d.id;
  });
}

/** Quick "price check": set today's market price from the detail page. */
export async function setMarketPrice(input: unknown) {
  const schema = z.object({
    id: z.string().uuid(),
    market: z.string(),
    source: z.string().trim().max(120).optional(),
  });
  return runAction(schema, input, async (d) => {
    const { parseDollars } = await import("@/lib/money");
    const cents = d.market.trim() === "" ? null : parseDollars(d.market);
    if (d.market.trim() !== "" && (cents === null || cents < 0)) throw new UserError("Enter a price like 42.50");
    await db((tx) =>
      tx
        .update(inventoryItems)
        .set({ marketCents: cents, marketSource: cents === null ? null : d.source || "Manual", marketUpdatedAt: cents === null ? null : new Date() })
        .where(eq(inventoryItems.id, d.id)),
    );
    revalidatePath(`/inventory/${d.id}`);
    return cents;
  });
}

export async function deleteItem(id: string) {
  return runAction(z.string().uuid(), id, async (itemId) => {
    await db(async (tx) => {
      const [row] = await tx.select({ status: inventoryItems.status }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
      if (!row) return;
      if ((CLOSED as readonly string[]).includes(row.status)) {
        throw new UserError("This card is part of a sale or trade. Undo that first.");
      }
      const photos = await tx.select({ path: itemPhotos.storagePath }).from(itemPhotos).where(eq(itemPhotos.itemId, itemId));
      await tx.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
      // Remove files no other row still uses.
      const paths = photos.map((p) => p.path);
      if (paths.length) {
        const stillUsed = await tx.select({ path: itemPhotos.storagePath }).from(itemPhotos).where(inArray(itemPhotos.storagePath, paths));
        const orphan = paths.filter((p) => !stillUsed.some((s) => s.path === p));
        if (orphan.length) await (await createClient()).storage.from("card-photos").remove(orphan);
      }
    });
    revalidatePath("/inventory");
    return itemId;
  });
}

export async function addPhoto(input: unknown) {
  const schema = z.object({ itemId: z.string().uuid(), storagePath: z.string().min(3).max(300) });
  return runAction(schema, input, async (d) => {
    if (!d.storagePath.startsWith(`${d.itemId}/`)) throw new UserError("Invalid photo path");
    const id = await db(async (tx) => {
      const [{ n }] = await tx
        .select({ n: sql<number>`coalesce(max(${itemPhotos.sort}) + 1, 0)::int` })
        .from(itemPhotos)
        .where(eq(itemPhotos.itemId, d.itemId));
      const [p] = await tx.insert(itemPhotos).values({ itemId: d.itemId, storagePath: d.storagePath, sort: n }).returning({ id: itemPhotos.id });
      return p.id;
    });
    revalidatePath(`/inventory/${d.itemId}`);
    return id;
  });
}

export async function removePhoto(photoId: string) {
  return runAction(z.string().uuid(), photoId, async (id) => {
    const itemId = await db(async (tx) => {
      const [p] = await tx.delete(itemPhotos).where(eq(itemPhotos.id, id)).returning();
      if (!p) return null;
      const [other] = await tx.select({ id: itemPhotos.id }).from(itemPhotos).where(eq(itemPhotos.storagePath, p.storagePath)).limit(1);
      if (!other) await (await createClient()).storage.from("card-photos").remove([p.storagePath]);
      return p.itemId;
    });
    if (itemId) revalidatePath(`/inventory/${itemId}`);
    return id;
  });
}

export async function makePrimaryPhoto(photoId: string) {
  return runAction(z.string().uuid(), photoId, async (id) => {
    await db(async (tx) => {
      const [p] = await tx.select().from(itemPhotos).where(eq(itemPhotos.id, id));
      if (!p) return;
      await tx.update(itemPhotos).set({ sort: sql`${itemPhotos.sort} + 1` }).where(eq(itemPhotos.itemId, p.itemId));
      await tx.update(itemPhotos).set({ sort: 0 }).where(eq(itemPhotos.id, id));
      revalidatePath(`/inventory/${p.itemId}`);
    });
    return id;
  });
}
