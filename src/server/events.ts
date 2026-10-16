import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Tx } from "@/db";
import { acquisitions, events, expenses, holders, inventoryItems, sales, settings } from "@/db/schema";
import { eventReport } from "@/lib/event-report";
import type { eventSchema } from "@/lib/validation";
import { UserError } from "./inventory";
import { listSales } from "./sales";
import { listTrades } from "./trades";

export type EventData = z.output<typeof eventSchema>;
export type EventRow = typeof events.$inferSelect;

export async function listEvents(tx: Tx) {
  return tx
    .select({
      event: events,
      salesCount: sql<number>`(select count(*)::int from ${sales} s where s.event_id = "events"."id")`,
      revenueCents: sql<number>`(select coalesce(sum(s.price_cents), 0)::bigint from ${sales} s where s.event_id = "events"."id")`.mapWith(Number),
      cashHolder: holders.name,
    })
    .from(events)
    .leftJoin(holders, eq(holders.id, events.cashHolderId))
    .orderBy(desc(events.startsOn));
}

export async function getEvent(tx: Tx, id: string) {
  const [row] = await tx.select().from(events).where(eq(events.id, id));
  return row ?? null;
}

export async function liveEvent(tx: Tx) {
  const [row] = await tx.select({ id: events.id, name: events.name }).from(events).where(eq(events.status, "live")).limit(1);
  return row ?? null;
}

/** Next planned show (today or later). */
export async function nextEvent(tx: Tx, today: string) {
  const [row] = await tx
    .select()
    .from(events)
    .where(and(eq(events.status, "planned"), sql`coalesce(${events.endsOn}, ${events.startsOn}) >= ${today}`))
    .orderBy(asc(events.startsOn))
    .limit(1);
  return row ?? null;
}

/** Create or update an event, keeping its table-fee expense in sync. */
export async function saveEvent(tx: Tx, data: EventData, id?: string) {
  const values = {
    name: data.name,
    startsOn: data.startsOn,
    endsOn: data.endsOn ?? null,
    location: data.location,
    tableFeeCents: data.tableFee,
    tableFeePaidByHolderId: data.tableFeePaidByHolderId,
    floatCents: data.float,
    cashHolderId: data.cashHolderId,
    notes: data.notes,
  };
  let event: EventRow;
  if (id) {
    const [row] = await tx.update(events).set(values).where(eq(events.id, id)).returning();
    if (!row) throw new UserError("That event no longer exists.");
    event = row;
  } else {
    [event] = await tx.insert(events).values(values).returning();
  }

  if (event.tableFeeCents > 0) {
    const expense = {
      spentOn: event.startsOn,
      category: "show_table_fee" as const,
      amountCents: event.tableFeeCents,
      description: `Table fee — ${event.name}`,
      eventId: event.id,
      paidByHolderId: event.tableFeePaidByHolderId,
    };
    const existing = event.tableFeeExpenseId
      ? (await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, event.tableFeeExpenseId)))[0]
      : undefined;
    if (existing) {
      await tx.update(expenses).set(expense).where(eq(expenses.id, existing.id));
    } else {
      const [e] = await tx.insert(expenses).values(expense).returning({ id: expenses.id });
      await tx.update(events).set({ tableFeeExpenseId: e.id }).where(eq(events.id, event.id));
    }
  } else if (event.tableFeeExpenseId) {
    await tx.delete(expenses).where(eq(expenses.id, event.tableFeeExpenseId));
    await tx.update(events).set({ tableFeeExpenseId: null }).where(eq(events.id, event.id));
  }
  return event.id;
}

export async function startEvent(tx: Tx, id: string, opts: { cashHolderId: string | null; floatCents: number }) {
  const live = await liveEvent(tx);
  if (live && live.id !== id) throw new UserError(`"${live.name}" is still live. Close it first.`);
  await tx
    .update(events)
    .set({ status: "live", startedAt: sql`coalesce(${events.startedAt}, now())`, cashHolderId: opts.cashHolderId, floatCents: opts.floatCents, closedAt: null })
    .where(eq(events.id, id));
}

export async function closeEvent(tx: Tx, id: string, countedCashCents: number | null) {
  await tx.update(events).set({ status: "closed", closedAt: new Date(), countedCashCents }).where(eq(events.id, id));
}

export async function reopenEvent(tx: Tx, id: string) {
  const live = await liveEvent(tx);
  if (live && live.id !== id) throw new UserError(`"${live.name}" is live. Close it first.`);
  await tx.update(events).set({ status: "live", closedAt: null }).where(eq(events.id, id));
}

export async function deleteEvent(tx: Tx, id: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(sales).where(eq(sales.eventId, id));
  if (n > 0) throw new UserError("This show has sales. Undo them first, or keep the show for your records.");
  const ev = await getEvent(tx, id);
  if (ev?.tableFeeExpenseId) await tx.delete(expenses).where(eq(expenses.id, ev.tableFeeExpenseId));
  await tx.delete(events).where(eq(events.id, id));
}

/** Everything the end-of-show report needs. */
export async function loadEventReport(tx: Tx, id: string) {
  const event = await getEvent(tx, id);
  if (!event) return null;
  const [eventSales, allTrades, buys, eventExpenses, [s]] = await Promise.all([
    listSales(tx, { eventId: id }),
    listTrades(tx),
    tx
      .select({
        id: acquisitions.id,
        priceCents: acquisitions.priceCents,
        feesCents: acquisitions.feesCents,
        shippingCents: acquisitions.shippingCents,
        paymentMethod: acquisitions.paymentMethod,
        source: acquisitions.source,
        // Outer column written out in full: in a single-table select Drizzle renders it as a bare "id".
        cards: sql<number>`(select coalesce(sum(i.quantity), 0)::int from ${inventoryItems} i where i.acquisition_id = "acquisitions"."id")`,
      })
      .from(acquisitions)
      .where(and(eq(acquisitions.eventId, id), inArray(acquisitions.kind, ["purchase", "bulk_lot"]))),
    tx.select().from(expenses).where(eq(expenses.eventId, id)).orderBy(asc(expenses.createdAt)),
    tx.select().from(settings).where(eq(settings.id, 1)),
  ]);
  const eventTrades = allTrades.filter((t) => t.eventId === id);
  const report = eventReport({
    floatCents: event.floatCents,
    countedCashCents: event.countedCashCents,
    sales: eventSales.map((x) => ({
      id: x.id,
      saleNo: x.saleNo,
      priceCents: x.priceCents,
      platformFeesCents: x.platformFeesCents,
      shippingCostCents: x.shippingCostCents,
      paymentMethod: x.paymentMethod,
      createdAt: x.createdAt,
      lines: x.lines.map((l) => ({
        cardId: l.cardId,
        cardName: l.cardName,
        quantity: l.quantity,
        priceCents: l.priceCents,
        costBasisCents: l.costBasisCents,
        costMissing: l.costMissing,
      })),
    })),
    trades: eventTrades.map((t) => ({
      cashInCents: t.cashInCents,
      cashOutCents: t.cashOutCents,
      paymentMethod: t.paymentMethod,
      outValueCents: t.outValueCents,
      outCostCents: t.out.reduce((a, l) => a + l.costBasisCents, 0),
    })),
    buys: buys.map((b) => ({ totalCents: (b.priceCents ?? 0) + b.feesCents + b.shippingCents, paymentMethod: b.paymentMethod, cards: b.cards })),
    expenses: eventExpenses.map((e) => ({ amountCents: e.amountCents, paymentMethod: e.paymentMethod, isTableFee: e.id === event.tableFeeExpenseId })),
  });
  return { event, report, sales: eventSales, trades: eventTrades, buys, expenses: eventExpenses, settings: s };
}
