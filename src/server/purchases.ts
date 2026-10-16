import "server-only";
import type { z } from "zod";
import type { Tx } from "@/db";
import { acquisitions, inventoryItems } from "@/db/schema";
import { splitLot, type LotLine } from "@/lib/money";
import type { purchaseSchema } from "@/lib/validation";
import { findOrCreateCard, UserError } from "./inventory";

export type PurchaseData = z.output<typeof purchaseSchema>;

/**
 * Record a purchase of one or many cards. With a total price the cost is split
 * across the lines (percent / market value / manual / even by quantity), and
 * fees + shipping follow the same shares. Without a price, costs stay blank
 * ("cost missing") so they can be filled in later.
 */
export async function createPurchase(tx: Tx, data: PurchaseData, opts: { kind?: "purchase" | "opening" } = {}) {
  const kind = opts.kind ?? (data.lines.length > 1 ? "bulk_lot" : "purchase");
  const lotLines: LotLine[] = data.lines.map((l) => ({
    quantity: l.quantity,
    shareBps: l.sharePct ?? undefined,
    unitMarketCents: l.unitMarket ?? undefined,
    manualCents: l.manualPrice ?? undefined,
  }));

  let costs: { purchaseCents: number | null; feesCents: number; shippingCents: number; gradingCents: number }[];
  if (data.price === null) {
    costs = data.lines.map(() => ({ purchaseCents: null, feesCents: 0, shippingCents: 0, gradingCents: 0 }));
    if (data.fees || data.shipping) {
      throw new UserError("Enter the total price too, so fees and shipping can be split across the cards.");
    }
  } else {
    try {
      costs = splitLot({
        priceCents: data.price,
        feesCents: data.fees,
        shippingCents: data.shipping,
        method: data.lines.length === 1 ? "even" : data.splitMethod,
        lines: lotLines,
      });
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Could not split the lot");
    }
  }

  const [acq] = await tx
    .insert(acquisitions)
    .values({
      kind,
      acquiredOn: data.acquiredOn,
      source: data.source,
      channel: data.channel ?? null,
      priceCents: data.price,
      feesCents: data.fees,
      shippingCents: data.shipping,
      splitMethod: data.lines.length > 1 ? data.splitMethod : null,
      paidByHolderId: data.paidByHolderId,
      eventId: data.eventId,
      notes: data.notes,
    })
    .returning({ id: acquisitions.id });

  const now = new Date();
  const itemIds: string[] = [];
  for (const [i, line] of data.lines.entries()) {
    const cardId = await findOrCreateCard(tx, line.card);
    const [item] = await tx
      .insert(inventoryItems)
      .values({
        cardId,
        quantity: line.quantity,
        ...line.condition,
        status: "in_stock",
        location: line.location,
        holderId: data.holderId ?? data.paidByHolderId,
        tags: line.tags,
        notes: line.notes,
        ...costs[i],
        acquisitionId: acq.id,
        acquiredOn: data.acquiredOn,
        askingMode: line.asking.askingMode,
        askingCents: line.asking.askingMode === "manual" ? line.asking.asking : null,
        markupBps: line.asking.askingMode === "markup" ? line.asking.markupPct : null,
        marketCents: line.unitMarket,
        marketSource: line.unitMarket !== null ? "Entered at purchase" : null,
        marketUpdatedAt: line.unitMarket !== null ? now : null,
      })
      .returning({ id: inventoryItems.id });
    itemIds.push(item.id);
  }
  return { acquisitionId: acq.id, itemIds };
}
