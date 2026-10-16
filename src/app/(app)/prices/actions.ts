"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { alertEvents, cards, inventoryItems, itemPriceHistory, marketProducts, priceAlerts, priceSnapshots, settings } from "@/db/schema";
import { db, getClaims, getCurrentPartner } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import type { ProviderProduct } from "@/lib/prices/types";
import { dollars, percentBps } from "@/lib/validation";
import { runAction } from "@/server/action";
import { UserError } from "@/server/inventory";
import { runPriceJob, usdFor } from "@/server/prices/job";
import { getProvider } from "@/server/prices/providers";

const providerId = z.enum(["tcgdex", "pricecharting"]);

function friendly(e: unknown): never {
  throw new UserError(e instanceof Error ? `Price source error: ${e.message}` : "Price source error");
}

/** Search a provider. With `details`, fetch the top results so set names and prices show. */
export async function searchProviderAction(input: unknown) {
  const schema = z.object({ provider: providerId, query: z.string().trim().min(2, "Type at least 2 letters").max(120), language: z.enum(["EN", "JP"]), details: z.boolean().default(true) });
  return runAction(schema, input, async (d): Promise<ProviderProduct[]> => {
    await getCurrentPartner();
    try {
      const p = getProvider(d.provider);
      const results = await p.search(d.query, { language: d.language });
      if (!d.details || d.provider === "pricecharting") return results;
      // TCGdex search results are brief; load the first few for set name + prices.
      const top = results.slice(0, 8);
      const full = await Promise.all(top.map((r) => p.fetch(r.externalId).catch(() => null)));
      return [...full.map((f, i) => f ?? top[i]), ...results.slice(8)];
    } catch (e) {
      friendly(e);
    }
  });
}

export async function fetchProductAction(input: unknown) {
  const schema = z.object({ provider: providerId, externalId: z.string().min(1).max(100) });
  return runAction(schema, input, async (d) => {
    await getCurrentPartner();
    try {
      const p = await getProvider(d.provider).fetch(d.externalId);
      if (!p) throw new UserError("That product wasn't found at the provider.");
      return p;
    } catch (e) {
      if (e instanceof UserError) throw e;
      friendly(e);
    }
  });
}

/** Link a card to a provider price and start following it. */
export async function linkItemAction(input: unknown) {
  const schema = z.object({
    itemId: z.string().uuid(),
    provider: providerId,
    externalId: z.string().min(1).max(100),
    priceField: z.string().min(1).max(80),
    useImage: z.boolean().default(true),
  });
  return runAction(schema, input, async (d) => {
    let product: ProviderProduct | null;
    try {
      product = await getProvider(d.provider).fetch(d.externalId);
    } catch (e) {
      friendly(e);
    }
    if (!product) throw new UserError("That product wasn't found at the provider.");
    const field = product.fields.find((f) => f.key === d.priceField);
    if (!field) throw new UserError("Pick one of the provider's price fields.");

    const res = await db(async (tx) => {
      const [s] = await tx.select({ eurUsdPpm: settings.eurUsdPpm }).from(settings).where(eq(settings.id, 1));
      const price = usdFor(product, d.priceField, s.eurUsdPpm);
      const now = new Date();
      const [mp] = await tx
        .insert(marketProducts)
        .values({
          provider: d.provider,
          externalId: product.externalId,
          priceField: d.priceField,
          label: field.label,
          productName: product.name,
          setName: product.setName,
          imageUrl: product.imageUrl,
          url: product.url,
          currency: field.currency,
          lastPriceCents: price?.usd ?? null,
          lastNativeCents: price?.native ?? null,
          lastFetchedAt: price ? now : null,
        })
        .onConflictDoUpdate({
          target: [marketProducts.provider, marketProducts.externalId, marketProducts.priceField],
          set: { label: field.label, productName: product.name, setName: product.setName, lastPriceCents: price?.usd ?? null, lastNativeCents: price?.native ?? null, lastFetchedAt: price ? now : null, lastError: null },
        })
        .returning({ id: marketProducts.id });
      if (price) {
        await tx
          .insert(priceSnapshots)
          .values({ productId: mp.id, onDate: todayISO(), priceCents: price.usd, nativeCents: price.native, currency: price.currency })
          .onConflictDoUpdate({ target: [priceSnapshots.productId, priceSnapshots.onDate], set: { priceCents: price.usd, nativeCents: price.native } });
      }
      const [item] = await tx
        .update(inventoryItems)
        .set({
          marketProductId: mp.id,
          marketMode: "auto",
          ...(price ? { marketCents: price.usd, marketSource: field.label, marketUpdatedAt: now } : {}),
        })
        .where(eq(inventoryItems.id, d.itemId))
        .returning({ cardId: inventoryItems.cardId, marketCents: inventoryItems.marketCents, marketSource: inventoryItems.marketSource });
      if (!item) throw new UserError("That card no longer exists.");
      if (item.marketCents !== null) await recordHistory(tx, d.itemId, item.marketCents, item.marketSource ?? field.label);
      if (d.useImage && product.imageUrl) {
        await tx.update(cards).set({ imageUrl: product.imageUrl }).where(and(eq(cards.id, item.cardId), isNull(cards.imageUrl)));
      }
      return { priceCents: price?.usd ?? null, label: field.label };
    });
    revalidatePath(`/inventory/${d.itemId}`);
    revalidatePath("/prices");
    return res;
  });
}

type RlsTx = Parameters<Parameters<typeof db>[0]>[0];
async function recordHistory(tx: RlsTx, itemId: string, priceCents: number, source: string) {
  await tx
    .insert(itemPriceHistory)
    .values({ itemId, onDate: todayISO(), priceCents, source })
    .onConflictDoUpdate({ target: [itemPriceHistory.itemId, itemPriceHistory.onDate], set: { priceCents, source } });
}

export async function unlinkItemAction(itemId: string) {
  return runAction(z.string().uuid(), itemId, async (id) => {
    await db((tx) => tx.update(inventoryItems).set({ marketProductId: null, marketMode: "manual" }).where(eq(inventoryItems.id, id)));
    revalidatePath(`/inventory/${id}`);
    revalidatePath("/prices");
    return id;
  });
}

/** Drop a manual override and go back to the linked feed's latest price. */
export async function followFeedAction(itemId: string) {
  return runAction(z.string().uuid(), itemId, async (id) => {
    await db(async (tx) => {
      const [row] = await tx
        .select({ mp: marketProducts })
        .from(inventoryItems)
        .innerJoin(marketProducts, eq(marketProducts.id, inventoryItems.marketProductId))
        .where(eq(inventoryItems.id, id));
      if (!row) throw new UserError("This card isn't linked to a price source yet.");
      const p = row.mp;
      await tx
        .update(inventoryItems)
        .set({
          marketMode: "auto",
          ...(p.lastPriceCents !== null ? { marketCents: p.lastPriceCents, marketSource: p.label, marketUpdatedAt: p.lastFetchedAt } : {}),
        })
        .where(eq(inventoryItems.id, id));
      if (p.lastPriceCents !== null) await recordHistory(tx, id, p.lastPriceCents, p.label);
    });
    revalidatePath(`/inventory/${id}`);
    return id;
  });
}

/** Manual market price override (wins over the feed until "Use feed price"). */
export async function setManualPriceAction(input: unknown) {
  const schema = z.object({
    id: z.string().uuid(),
    market: dollars("Market price"),
    source: z.string().trim().max(120).optional(),
  });
  return runAction(schema, input, async (d) => {
    const source = d.source?.trim() || "Manual";
    await db(async (tx) => {
      await tx
        .update(inventoryItems)
        .set({ marketCents: d.market, marketSource: source, marketUpdatedAt: new Date(), marketMode: "manual" })
        .where(eq(inventoryItems.id, d.id));
      await recordHistory(tx, d.id, d.market, `${source} (manual)`);
    });
    revalidatePath(`/inventory/${d.id}`);
    return d.market;
  });
}

export async function runPricesNowAction() {
  return runAction(z.undefined(), undefined, async () => {
    await getCurrentPartner(); // members only; the job itself runs with the server connection
    const res = await runPriceJob();
    revalidatePath("/", "layout");
    return res;
  });
}

const alertSchema = z
  .object({
    itemId: z.string().uuid(),
    kind: z.enum(["move_pct", "above", "below"]),
    pct: percentBps("Percent", { min: 1, max: 100000 }),
    windowDays: z.coerce.number().int().min(1).max(365).default(7),
    target: z.string().optional(),
    note: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "move_pct" && v.pct === null) ctx.addIssue({ code: "custom", path: ["pct"], message: "Enter a percent like 15" });
    if (v.kind !== "move_pct") {
      const r = dollars("Target price").safeParse(v.target ?? "");
      if (!r.success || r.data <= 0) ctx.addIssue({ code: "custom", path: ["target"], message: "Enter a target price" });
    }
  });

export async function createAlertAction(input: unknown) {
  return runAction(alertSchema, input, async (d) => {
    const target = d.kind === "move_pct" ? null : dollars("Target price").parse(d.target);
    await db((tx) =>
      tx.insert(priceAlerts).values({
        itemId: d.itemId,
        kind: d.kind,
        thresholdBps: d.kind === "move_pct" ? d.pct : null,
        windowDays: d.windowDays,
        targetCents: target,
        note: d.note || null,
      }),
    );
    revalidatePath(`/inventory/${d.itemId}`);
    return true;
  });
}

export async function deleteAlertAction(id: string) {
  return runAction(z.string().uuid(), id, async (alertId) => {
    const [row] = await db((tx) => tx.delete(priceAlerts).where(eq(priceAlerts.id, alertId)).returning({ itemId: priceAlerts.itemId }));
    if (row) revalidatePath(`/inventory/${row.itemId}`);
    return alertId;
  });
}

export async function dismissAlertsAction(ids: string[]) {
  return runAction(z.array(z.string().uuid()).min(1).max(500), ids, async (list) => {
    const claims = await getClaims();
    await db((tx) =>
      tx
        .update(alertEvents)
        .set({ acknowledgedAt: new Date(), acknowledgedBy: claims?.sub ?? null })
        .where(and(inArray(alertEvents.id, list), isNull(alertEvents.acknowledgedAt))),
    );
    revalidatePath("/", "layout");
    return list.length;
  });
}
