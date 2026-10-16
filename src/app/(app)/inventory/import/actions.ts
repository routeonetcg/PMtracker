"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acquisitions, inventoryItems } from "@/db/schema";
import { db } from "@/lib/auth";
import { importRowSchema } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { runAction } from "@/server/action";
import { findOrCreateCard } from "@/server/inventory";

export async function importInventory(input: unknown) {
  return runAction(z.array(importRowSchema).min(1).max(2000), input, async (rows) => {
    const count = await db(async (tx) => {
      const today = todayISO();
      const [acq] = await tx
        .insert(acquisitions)
        .values({ kind: "opening", acquiredOn: today, source: "CSV import", notes: `${rows.length} rows imported` })
        .returning({ id: acquisitions.id });
      const now = new Date();
      for (const r of rows) {
        const cardId = await findOrCreateCard(tx, {
          name: r.name,
          setName: r.set,
          setCode: r.set_code,
          number: r.number,
          language: r.language,
          rarity: r.rarity,
          variants: r.variants,
          imageUrl: null,
        });
        await tx.insert(inventoryItems).values({
          cardId,
          quantity: r.quantity,
          conditionType: r.conditionType,
          rawCondition: r.rawCondition,
          grader: r.grader,
          grade: r.grade,
          gradeLabel: r.grade_label,
          certNumber: r.cert_number,
          status: r.status,
          location: r.location,
          tags: r.tags,
          notes: r.notes,
          purchaseCents: r.purchase,
          feesCents: r.fees,
          shippingCents: r.shipping,
          gradingCents: r.grading,
          acquisitionId: acq.id,
          acquiredOn: r.acquired_on ?? today,
          askingMode: r.markup_pct !== null && r.asking === null ? "markup" : "manual",
          askingCents: r.asking,
          markupBps: r.markup_pct,
          marketCents: r.market_each,
          marketSource: r.market_each !== null ? (r.market_source ?? "CSV import") : null,
          marketUpdatedAt: r.market_each !== null ? now : null,
        });
      }
      return rows.length;
    });
    revalidatePath("/inventory");
    revalidatePath("/");
    return count;
  });
}
