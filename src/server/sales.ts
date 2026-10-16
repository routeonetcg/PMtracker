import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Tx } from "@/db";
import { cards, events, holders, inventoryItems, partners, saleLines, sales } from "@/db/schema";
import { computeSale, effectiveAsking } from "@/lib/money";
import type { saleSchema } from "@/lib/validation";
import { getSettings, takeCopies, UserError } from "./inventory";

export type SaleData = z.output<typeof saleSchema>;

/**
 * Record a sale (one card) or bundle (several cards, one price). Partial
 * quantities split the inventory row first so the sold copies carry their
 * exact share of cost. Profit = price − fees − shipping − cost, per line.
 */
export async function createSale(tx: Tx, data: SaleData) {
  const s = await getSettings(tx);
  const ids = data.lines.map((l) => l.itemId);
  const rows = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, ids));
  if (rows.length !== ids.length) throw new UserError("A card in this sale no longer exists.");

  // Weight for bundle split: market value, falling back to asking price, then 1.
  const weights = data.lines.map((l) => {
    const r = rows.find((x) => x.id === l.itemId)!;
    const asking = effectiveAsking({ ...r, roundUpToCents: s.roundAskingToCents });
    const unit = r.marketCents ?? asking ?? 0;
    return unit * l.quantity;
  });
  const useWeights = data.split === "weight" && weights.some((w) => w > 0);

  const taken: Awaited<ReturnType<typeof takeCopies>>[] = [];
  for (const line of data.lines) taken.push(await takeCopies(tx, line.itemId, line.quantity, "sold"));

  let result;
  try {
    result = computeSale({
      priceCents: data.price,
      platformFeesCents: data.platformFees,
      shippingCostCents: data.shippingCost,
      split: data.split === "weight" && !useWeights ? "even" : data.split,
      lines: data.lines.map((l, i) => ({
        costBasisCents: taken[i].costBasisCents,
        weightCents: weights[i],
        manualPriceCents: l.manualPrice ?? undefined,
      })),
    });
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : "Could not calculate the sale");
  }

  const [sale] = await tx
    .insert(sales)
    .values({
      soldOn: data.soldOn,
      channel: data.channel,
      eventId: data.eventId,
      priceCents: data.price,
      platformFeesCents: data.platformFees,
      shippingCostCents: data.shippingCost,
      paymentMethod: data.paymentMethod,
      soldByPartnerId: data.soldByPartnerId,
      receivedByHolderId: data.receivedByHolderId,
      splitMethod: data.split,
      buyerNote: data.buyerNote,
    })
    .returning({ id: sales.id, saleNo: sales.saleNo });

  await tx.insert(saleLines).values(
    result.lines.map((l, i) => ({
      saleId: sale.id,
      itemId: taken[i].id,
      quantity: data.lines[i].quantity,
      priceCents: l.priceCents,
      feesCents: l.feesCents,
      shippingCents: l.shippingCents,
      costBasisCents: l.costBasisCents,
      costMissing: taken[i].costMissing,
    })),
  );
  return { id: sale.id, saleNo: sale.saleNo, profitCents: result.profitCents };
}

/** Undo a sale: the cards go back in stock and the sale is deleted (kept in the activity log). */
export async function voidSale(tx: Tx, saleId: string) {
  const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  if (!lines.length) {
    const [exists] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.id, saleId));
    if (!exists) throw new UserError("That sale was already removed.");
  }
  if (lines.length) {
    await tx
      .update(inventoryItems)
      .set({ status: "in_stock" })
      .where(and(inArray(inventoryItems.id, lines.map((l) => l.itemId)), eq(inventoryItems.status, "sold")));
  }
  await tx.delete(sales).where(eq(sales.id, saleId));
}

export async function listSales(tx: Tx, opts: { limit?: number; eventId?: string } = {}) {
  const rows = await tx
    .select({
      id: sales.id,
      saleNo: sales.saleNo,
      soldOn: sales.soldOn,
      channel: sales.channel,
      priceCents: sales.priceCents,
      platformFeesCents: sales.platformFeesCents,
      shippingCostCents: sales.shippingCostCents,
      paymentMethod: sales.paymentMethod,
      buyerNote: sales.buyerNote,
      soldBy: partners.displayName,
      eventName: events.name,
      eventId: sales.eventId,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .leftJoin(partners, eq(partners.id, sales.soldByPartnerId))
    .leftJoin(events, eq(events.id, sales.eventId))
    .where(opts.eventId ? eq(sales.eventId, opts.eventId) : undefined)
    .orderBy(desc(sales.soldOn), desc(sales.saleNo))
    .limit(opts.limit ?? 1000);

  const lines = rows.length
    ? await tx
        .select({
          saleId: saleLines.saleId,
          itemId: saleLines.itemId,
          quantity: saleLines.quantity,
          priceCents: saleLines.priceCents,
          feesCents: saleLines.feesCents,
          shippingCents: saleLines.shippingCents,
          costBasisCents: saleLines.costBasisCents,
          costMissing: saleLines.costMissing,
          cardName: cards.name,
          setName: cards.setName,
          number: cards.number,
          language: cards.language,
          imageUrl: cards.imageUrl,
          itemNo: inventoryItems.itemNo,
        })
        .from(saleLines)
        .innerJoin(inventoryItems, eq(inventoryItems.id, saleLines.itemId))
        .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
        .where(inArray(saleLines.saleId, rows.map((r) => r.id)))
    : [];

  return rows.map((r) => {
    const ls = lines.filter((l) => l.saleId === r.id);
    const cost = ls.reduce((a, l) => a + l.costBasisCents, 0);
    return {
      ...r,
      lines: ls,
      costBasisCents: cost,
      costMissing: ls.some((l) => l.costMissing),
      profitCents: r.priceCents - r.platformFeesCents - r.shippingCostCents - cost,
    };
  });
}
export type SaleRow = Awaited<ReturnType<typeof listSales>>[number];

export async function getSaleHolders(tx: Tx) {
  return tx.select().from(holders);
}
