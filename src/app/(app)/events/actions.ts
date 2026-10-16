"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { holders } from "@/db/schema";
import { db, getCurrentPartner } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { keys, PAYMENT_METHODS } from "@/lib/labels";
import { estimateFee } from "@/lib/money";
import { cardSchema, conditionSchema, dollars, eventSchema, optionalDollars } from "@/lib/validation";
import { runAction } from "@/server/action";
import { closeEvent, deleteEvent, getEvent, reopenEvent, saveEvent, startEvent } from "@/server/events";
import { getSettings, UserError } from "@/server/inventory";
import { createPurchase } from "@/server/purchases";
import { createSale } from "@/server/sales";

const uuid = z.string().uuid();
const paymentMethod = z.enum(keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS, ...(keyof typeof PAYMENT_METHODS)[]]);

function refresh(id?: string) {
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/events/${id}`);
}

export async function saveEventAction(input: unknown) {
  return runAction(eventSchema.and(z.object({ id: uuid.optional() })), input, async (d) => {
    const id = await db((tx) => saveEvent(tx, d, d.id));
    refresh(id);
    return id;
  });
}

export async function startEventAction(input: unknown) {
  const schema = z.object({ id: uuid, cashHolderId: uuid, float: dollars("Starting cash") });
  return runAction(schema, input, async (d) => {
    await db((tx) => startEvent(tx, d.id, { cashHolderId: d.cashHolderId, floatCents: d.float }));
    refresh(d.id);
    return d.id;
  });
}

export async function closeEventAction(input: unknown) {
  const schema = z.object({ id: uuid, countedCash: optionalDollars("Counted cash") });
  return runAction(schema, input, async (d) => {
    await db((tx) => closeEvent(tx, d.id, d.countedCash));
    refresh(d.id);
    return d.id;
  });
}

export async function reopenEventAction(id: string) {
  return runAction(uuid, id, async (eventId) => {
    await db((tx) => reopenEvent(tx, eventId));
    refresh(eventId);
    return eventId;
  });
}

export async function deleteEventAction(id: string) {
  return runAction(uuid, id, async (eventId) => {
    await db((tx) => deleteEvent(tx, eventId));
    refresh();
    return eventId;
  });
}

async function holderIds(partnerId: string, eventCashHolderId: string | null) {
  const mine = await db((tx) => tx.select({ id: holders.id }).from(holders).where(eq(holders.partnerId, partnerId)));
  const myHolder = mine[0]?.id ?? null;
  return { myHolder, cashHolder: eventCashHolderId ?? myHolder };
}

/**
 * Show Mode sale: one card, one tap. Cash goes to whoever holds the cash box;
 * digital payments go to the partner who rang it up. Card payments get the
 * reader fee from Settings. `clientRef` makes retries safe.
 */
export async function showSellAction(input: unknown) {
  const schema = z.object({
    eventId: uuid,
    itemId: uuid,
    quantity: z.coerce.number().int().min(1).default(1),
    price: dollars("Price"),
    paymentMethod,
    clientRef: z.string().min(8).max(64),
  });
  return runAction(schema, input, async (d) => {
    const me = await getCurrentPartner();
    const res = await db(async (tx) => {
      const ev = await getEvent(tx, d.eventId);
      if (!ev) throw new UserError("That show no longer exists.");
      const s = await getSettings(tx);
      const mine = await tx.select({ id: holders.id }).from(holders).where(eq(holders.partnerId, me.id));
      const myHolder = mine[0]?.id ?? null;
      const fees = d.paymentMethod === "card" ? estimateFee(d.price, s.cardFeeBps, s.cardFeeFixedCents) : 0;
      return createSale(tx, {
        soldOn: todayISO(),
        channel: "card_show",
        eventId: d.eventId,
        price: d.price,
        platformFees: fees,
        shippingCost: 0,
        paymentMethod: d.paymentMethod,
        soldByPartnerId: me.id,
        receivedByHolderId: d.paymentMethod === "cash" ? (ev.cashHolderId ?? myHolder) : myHolder,
        split: "weight",
        buyerNote: null,
        clientRef: d.clientRef,
        lines: [{ itemId: d.itemId, quantity: d.quantity, manualPrice: null }],
      });
    });
    refresh(d.eventId);
    return res;
  });
}

/** Show Mode buy: someone sells us a card at the table. */
export async function showBuyAction(input: unknown) {
  const schema = z.object({
    eventId: uuid,
    card: cardSchema,
    condition: conditionSchema,
    quantity: z.coerce.number().int().min(1).max(1000).default(1),
    price: dollars("Price paid"),
    asking: optionalDollars("Asking price"),
    paymentMethod,
  });
  return runAction(schema, input, async (d) => {
    const me = await getCurrentPartner();
    const ev = await db((tx) => getEvent(tx, d.eventId));
    if (!ev) throw new UserError("That show no longer exists.");
    const { myHolder, cashHolder } = await holderIds(me.id, ev.cashHolderId);
    const payer = d.paymentMethod === "cash" ? cashHolder : myHolder;
    const res = await db((tx) =>
      createPurchase(tx, {
        acquiredOn: todayISO(),
        source: `Bought at ${ev.name}`,
        channel: "card_show",
        eventId: d.eventId,
        paidByHolderId: payer,
        holderId: payer,
        paymentMethod: d.paymentMethod,
        price: d.price,
        fees: 0,
        shipping: 0,
        splitMethod: "even",
        notes: null,
        lines: [
          {
            card: d.card,
            condition: d.condition,
            quantity: d.quantity,
            sharePct: null,
            unitMarket: null,
            manualPrice: null,
            asking: { askingMode: "manual", asking: d.asking, markupPct: null },
            location: "show_box",
            tags: [],
            notes: null,
          },
        ],
      }),
    );
    refresh(d.eventId);
    return res;
  });
}
