import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Tx } from "@/db";
import { acquisitions, cards, inventoryItems, itemPriceHistory, partners, tradeLines, trades } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { computeTrade } from "@/lib/money";
import type { tradeSchema } from "@/lib/validation";
import { findOrCreateCard, takeCopies, UserError } from "./inventory";

export type TradeData = z.output<typeof tradeSchema>;

/**
 * Cards out realize profit at their agreed value; cards in get a cost basis
 * equal to what we gave up (out value + cash paid − cash received), split by
 * their agreed values.
 */
export async function createTrade(tx: Tx, data: TradeData) {
  const taken: Awaited<ReturnType<typeof takeCopies>>[] = [];
  for (const o of data.out) taken.push(await takeCopies(tx, o.itemId, o.quantity, "traded"));

  const result = computeTrade({
    out: data.out.map((o, i) => ({ agreedValueCents: o.agreedValue, costBasisCents: taken[i].costBasisCents })),
    in: data.in.map((l) => ({ agreedValueCents: l.agreedValue })),
    cashInCents: data.cashIn,
    cashOutCents: data.cashOut,
  });

  const [trade] = await tx
    .insert(trades)
    .values({
      tradedOn: data.tradedOn,
      channel: data.channel,
      eventId: data.eventId,
      partnerId: data.partnerId,
      holderId: data.holderId,
      cashInCents: data.cashIn,
      cashOutCents: data.cashOut,
      paymentMethod: data.paymentMethod,
      counterparty: data.counterparty,
      notes: data.notes,
    })
    .returning({ id: trades.id, tradeNo: trades.tradeNo });

  if (data.out.length) {
    await tx.insert(tradeLines).values(
      data.out.map((o, i) => ({
        tradeId: trade.id,
        direction: "out" as const,
        itemId: taken[i].id,
        quantity: o.quantity,
        agreedValueCents: o.agreedValue,
        costBasisCents: taken[i].costBasisCents,
        costMissing: taken[i].costMissing,
      })),
    );
  }

  if (data.in.length) {
    const [acq] = await tx
      .insert(acquisitions)
      .values({
        kind: "trade_in",
        acquiredOn: data.tradedOn,
        source: data.counterparty ? `Trade with ${data.counterparty}` : `Trade #${trade.tradeNo}`,
        channel: data.channel,
        priceCents: result.inCostCents.reduce((a, b) => a + b, 0),
        paidByHolderId: data.holderId,
        partnerId: data.partnerId,
        eventId: data.eventId,
        tradeId: trade.id,
      })
      .returning({ id: acquisitions.id });
    const now = new Date();
    for (const [i, l] of data.in.entries()) {
      const cardId = await findOrCreateCard(tx, l.card);
      const [item] = await tx
        .insert(inventoryItems)
        .values({
          cardId,
          quantity: l.quantity,
          ...l.condition,
          status: "in_stock",
          location: l.location,
          holderId: data.holderId,
          purchaseCents: result.inCostCents[i],
          acquisitionId: acq.id,
          acquiredOn: data.tradedOn,
          askingMode: l.asking.askingMode,
          askingCents: l.asking.askingMode === "manual" ? l.asking.asking : null,
          markupBps: l.asking.askingMode === "markup" ? l.asking.markupPct : null,
          marketCents: l.unitMarket,
          marketSource: l.unitMarket !== null ? "Entered at trade" : null,
          marketUpdatedAt: l.unitMarket !== null ? now : null,
        })
        .returning({ id: inventoryItems.id });
      if (l.unitMarket !== null) {
        await tx.insert(itemPriceHistory).values({ itemId: item.id, onDate: todayISO(), priceCents: l.unitMarket, source: "Entered at trade" });
      }
      await tx.insert(tradeLines).values({
        tradeId: trade.id,
        direction: "in",
        itemId: item.id,
        quantity: l.quantity,
        agreedValueCents: l.agreedValue,
        costBasisCents: result.inCostCents[i],
      });
    }
  }
  return { id: trade.id, tradeNo: trade.tradeNo, realizedProfitCents: result.realizedProfitCents, imbalanceCents: result.imbalanceCents };
}

/** Undo a trade. Only possible while every card that came in is still in stock. */
export async function voidTrade(tx: Tx, tradeId: string) {
  const lines = await tx.select().from(tradeLines).where(eq(tradeLines.tradeId, tradeId));
  const inIds = lines.filter((l) => l.direction === "in").map((l) => l.itemId);
  const outIds = lines.filter((l) => l.direction === "out").map((l) => l.itemId);
  if (inIds.length) {
    const ins = await tx.select({ status: inventoryItems.status }).from(inventoryItems).where(inArray(inventoryItems.id, inIds));
    if (ins.some((r) => r.status !== "in_stock")) {
      throw new UserError("Some cards from this trade were already sold or moved, so it can't be undone.");
    }
  }
  await tx.delete(trades).where(eq(trades.id, tradeId));
  if (inIds.length) await tx.delete(inventoryItems).where(inArray(inventoryItems.id, inIds));
  await tx.delete(acquisitions).where(eq(acquisitions.tradeId, tradeId));
  if (outIds.length) await tx.update(inventoryItems).set({ status: "in_stock" }).where(inArray(inventoryItems.id, outIds));
}

export async function listTrades(tx: Tx) {
  const rows = await tx
    .select({
      id: trades.id,
      tradeNo: trades.tradeNo,
      tradedOn: trades.tradedOn,
      channel: trades.channel,
      cashInCents: trades.cashInCents,
      cashOutCents: trades.cashOutCents,
      counterparty: trades.counterparty,
      notes: trades.notes,
      partner: partners.displayName,
      eventId: trades.eventId,
      paymentMethod: trades.paymentMethod,
    })
    .from(trades)
    .leftJoin(partners, eq(partners.id, trades.partnerId))
    .orderBy(desc(trades.tradedOn), desc(trades.tradeNo));
  const lines = rows.length
    ? await tx
        .select({
          tradeId: tradeLines.tradeId,
          direction: tradeLines.direction,
          itemId: tradeLines.itemId,
          quantity: tradeLines.quantity,
          agreedValueCents: tradeLines.agreedValueCents,
          costBasisCents: tradeLines.costBasisCents,
          costMissing: tradeLines.costMissing,
          cardName: cards.name,
          setName: cards.setName,
          number: cards.number,
          imageUrl: cards.imageUrl,
          itemNo: inventoryItems.itemNo,
        })
        .from(tradeLines)
        .innerJoin(inventoryItems, eq(inventoryItems.id, tradeLines.itemId))
        .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
        .where(inArray(tradeLines.tradeId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => {
    const ls = lines.filter((l) => l.tradeId === r.id);
    const out = ls.filter((l) => l.direction === "out");
    return {
      ...r,
      out,
      in: ls.filter((l) => l.direction === "in"),
      realizedProfitCents: out.reduce((a, l) => a + l.agreedValueCents - l.costBasisCents, 0),
      outValueCents: out.reduce((a, l) => a + l.agreedValueCents, 0),
    };
  });
}
export type TradeRow = Awaited<ReturnType<typeof listTrades>>[number];
