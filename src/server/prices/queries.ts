import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { alertEvents, cards, inventoryItems, inventoryValueSnapshots, marketProducts } from "@/db/schema";
import { ACTIVE_STATUSES } from "@/lib/labels";

export async function openAlerts(tx: Tx, limit = 50) {
  return tx
    .select({
      id: alertEvents.id,
      itemId: alertEvents.itemId,
      kind: alertEvents.kind,
      onDate: alertEvents.onDate,
      fromCents: alertEvents.fromCents,
      toCents: alertEvents.toCents,
      changeBps: alertEvents.changeBps,
      message: alertEvents.message,
      cardName: cards.name,
      imageUrl: cards.imageUrl,
    })
    .from(alertEvents)
    .innerJoin(inventoryItems, eq(inventoryItems.id, alertEvents.itemId))
    .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
    .where(isNull(alertEvents.acknowledgedAt))
    .orderBy(desc(alertEvents.onDate), desc(alertEvents.createdAt))
    .limit(limit);
}
export type OpenAlert = Awaited<ReturnType<typeof openAlerts>>[number];

export async function openAlertCountRls(tx: Tx) {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(alertEvents).where(isNull(alertEvents.acknowledgedAt));
  return r?.n ?? 0;
}

/** Feeds whose last update failed, with how many cards follow them. */
export async function failingFeeds(tx: Tx) {
  return tx
    .select({
      id: marketProducts.id,
      productName: marketProducts.productName,
      label: marketProducts.label,
      lastError: marketProducts.lastError,
      lastFetchedAt: marketProducts.lastFetchedAt,
      cards: sql<number>`(select count(*)::int from ${inventoryItems} i where i.market_product_id = "market_products"."id")`,
    })
    .from(marketProducts)
    .where(and(sql`${marketProducts.lastError} is not null`, inArray(marketProducts.id, tx.select({ id: inventoryItems.marketProductId }).from(inventoryItems).where(inArray(inventoryItems.status, ACTIVE_STATUSES)))));
}

/** Month-end market value from the daily snapshots (for the dashboard chart). */
export async function monthlyValueSnapshots(tx: Tx) {
  const rows = await tx.select().from(inventoryValueSnapshots).orderBy(inventoryValueSnapshots.onDate);
  const byMonth = new Map<string, { marketCents: number; costCents: number; onDate: string }>();
  for (const r of rows) byMonth.set(r.onDate.slice(0, 7), { marketCents: r.marketCents, costCents: r.costCents, onDate: r.onDate });
  return byMonth;
}
