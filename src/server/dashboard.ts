import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { cards, expenses, inventoryItems, saleLines, sales, tradeLines, trades } from "@/db/schema";
import { type Period, todayISO } from "@/lib/dates";
import { ACTIVE_STATUSES } from "@/lib/labels";
import { computeMetrics, type Realization } from "@/lib/metrics";
import { costBasis } from "@/lib/money";
import { getSettings } from "./inventory";

export async function loadDashboard(tx: Tx, period: Period) {
  const s = await getSettings(tx);
  const today = todayISO();

  const saleRows = await tx
    .select({
      date: sales.soldOn,
      channel: sales.channel,
      itemId: saleLines.itemId,
      quantity: saleLines.quantity,
      price: saleLines.priceCents,
      fees: saleLines.feesCents,
      shipping: saleLines.shippingCents,
      cost: saleLines.costBasisCents,
      costMissing: saleLines.costMissing,
      cardId: cards.id,
      cardName: cards.name,
      acquiredOn: inventoryItems.acquiredOn,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, saleLines.itemId))
    .innerJoin(cards, eq(cards.id, inventoryItems.cardId));

  const tradeRows = await tx
    .select({
      date: trades.tradedOn,
      channel: trades.channel,
      itemId: tradeLines.itemId,
      quantity: tradeLines.quantity,
      value: tradeLines.agreedValueCents,
      cost: tradeLines.costBasisCents,
      costMissing: tradeLines.costMissing,
      cardId: cards.id,
      cardName: cards.name,
      acquiredOn: inventoryItems.acquiredOn,
    })
    .from(tradeLines)
    .innerJoin(trades, eq(trades.id, tradeLines.tradeId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, tradeLines.itemId))
    .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
    .where(eq(tradeLines.direction, "out"));

  const realizations: Realization[] = [
    ...saleRows.map((r) => ({
      kind: "sale" as const,
      date: r.date,
      channel: r.channel,
      cardId: r.cardId,
      cardName: r.cardName,
      quantity: r.quantity,
      revenueCents: r.price,
      feesCents: r.fees,
      shippingCents: r.shipping,
      costBasisCents: r.cost,
      costMissing: r.costMissing,
      acquiredOn: r.acquiredOn,
    })),
    ...tradeRows.map((r) => ({
      kind: "trade" as const,
      date: r.date,
      channel: r.channel,
      cardId: r.cardId,
      cardName: r.cardName,
      quantity: r.quantity,
      revenueCents: r.value,
      feesCents: 0,
      shippingCents: 0,
      costBasisCents: r.cost,
      costMissing: r.costMissing,
      acquiredOn: r.acquiredOn,
    })),
  ];

  const expenseRows = await tx.select({ date: expenses.spentOn, amountCents: expenses.amountCents }).from(expenses);

  const items = await tx
    .select({
      id: inventoryItems.id,
      status: inventoryItems.status,
      quantity: inventoryItems.quantity,
      purchaseCents: inventoryItems.purchaseCents,
      feesCents: inventoryItems.feesCents,
      shippingCents: inventoryItems.shippingCents,
      gradingCents: inventoryItems.gradingCents,
      marketCents: inventoryItems.marketCents,
      acquiredOn: inventoryItems.acquiredOn,
      cardName: cards.name,
      imageUrl: cards.imageUrl,
      itemNo: inventoryItems.itemNo,
    })
    .from(inventoryItems)
    .innerJoin(cards, eq(cards.id, inventoryItems.cardId));

  const disposed = new Map<string, string>();
  for (const r of saleRows) disposed.set(r.itemId, r.date);
  for (const r of tradeRows) disposed.set(r.itemId, r.date);

  const active = items.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const metrics = computeMetrics({
    period,
    realizations,
    expenses: expenseRows.map((e) => ({ date: e.date, amountCents: e.amountCents })),
    stock: active.map((i) => ({
      id: i.id,
      cardName: i.cardName,
      quantity: i.quantity,
      costBasisCents: costBasis(i),
      marketCents: i.marketCents,
      acquiredOn: i.acquiredOn,
    })),
    history: items
      .filter((i) => i.status !== "personal")
      .map((i) => ({
        acquiredOn: i.acquiredOn,
        disposedOn: disposed.get(i.id) ?? null,
        costBasisCents: costBasis(i),
        active: ACTIVE_STATUSES.includes(i.status),
      })),
    slowMoverDays: s.slowMoverDays,
    today,
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const costMissingInStock = active.filter((i) => i.purchaseCents === null).length;
  return {
    metrics,
    settings: s,
    costMissingInStock,
    slowMovers: metrics.slowMovers.map((m) => ({ ...m, itemNo: byId.get(m.id)?.itemNo, imageUrl: byId.get(m.id)?.imageUrl ?? null })),
  };
}

export async function itemNumbers(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  return tx.select({ id: inventoryItems.id, itemNo: inventoryItems.itemNo }).from(inventoryItems).where(inArray(inventoryItems.id, ids));
}
