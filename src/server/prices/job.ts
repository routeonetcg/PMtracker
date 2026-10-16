import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { adminDb } from "@/db";
import {
  alertEvents,
  cards,
  inventoryItems,
  inventoryValueSnapshots,
  itemPriceHistory,
  marketProducts,
  priceAlerts,
  priceSnapshots,
  settings,
} from "@/db/schema";
import { type AlertRule, evaluateAlerts } from "@/lib/alerts";
import { addDays, todayISO } from "@/lib/dates";
import { ACTIVE_STATUSES } from "@/lib/labels";
import { costBasis, eurToUsdCents } from "@/lib/money";
import type { ProviderId, ProviderProduct } from "@/lib/prices/types";
import { fetchEurUsdPpm, getProvider, usingFixtures } from "./providers";

export type PriceJobResult = {
  asOf: string;
  products: number;
  updated: number;
  failed: { label: string; error: string }[];
  itemsUpdated: number;
  alertsFired: number;
  eurUsdPpm: number;
  sample: boolean;
  ms: number;
};

type Db = ReturnType<typeof adminDb>;

/** Fetch with limited concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** USD cents for one field of a fetched product (EUR converted at the day's rate). */
export function usdFor(p: ProviderProduct, fieldKey: string, eurUsdPpm: number): { usd: number; native: number; currency: string } | null {
  const f = p.fields.find((x) => x.key === fieldKey);
  if (!f || f.nativeCents === null) return null;
  return { usd: f.currency === "EUR" ? eurToUsdCents(f.nativeCents, eurUsdPpm) : f.nativeCents, native: f.nativeCents, currency: f.currency };
}

/**
 * The daily price update:
 * 1. refresh the EUR→USD rate (ECB);
 * 2. fetch every market product linked to a card on hand (once per product);
 * 3. save a dated snapshot and update cards that follow the feed (manual overrides are left alone);
 * 4. record each card's effective price for the day (history chart);
 * 5. save the day's inventory value totals;
 * 6. evaluate price alerts.
 * Runs with the privileged connection (cron has no signed-in user); safe to run more than once a day.
 */
export async function runPriceJob(opts: { asOf?: string } = {}): Promise<PriceJobResult> {
  const started = Date.now();
  const db = adminDb();
  const asOf = opts.asOf ?? todayISO();
  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!s) throw new Error("Settings missing — run pnpm db:seed");

  const fetchedRate = await fetchEurUsdPpm(asOf);
  const rate = fetchedRate ?? s.eurUsdPpm;

  const products = await db
    .select()
    .from(marketProducts)
    .where(
      inArray(
        marketProducts.id,
        db
          .select({ id: inventoryItems.marketProductId })
          .from(inventoryItems)
          .where(and(isNotNull(inventoryItems.marketProductId), inArray(inventoryItems.status, ACTIVE_STATUSES))),
      ),
    );

  // One request per provider product, even when several price fields / cards use it.
  const keys = [...new Map(products.map((p) => [`${p.provider}|${p.externalId}`, { provider: p.provider, externalId: p.externalId }])).values()];
  const fetched = new Map<string, ProviderProduct | Error>();
  for (const provider of ["tcgdex", "pricecharting"] as ProviderId[]) {
    const mine = keys.filter((k) => k.provider === provider);
    if (!mine.length) continue;
    await mapLimit(mine, provider === "pricecharting" ? 1 : 4, async (k) => {
      try {
        const p = await getProvider(provider).fetch(k.externalId, { asOf });
        fetched.set(`${provider}|${k.externalId}`, p ?? new Error("Not found at provider"));
      } catch (e) {
        fetched.set(`${provider}|${k.externalId}`, e instanceof Error ? e : new Error(String(e)));
      }
      if (provider === "pricecharting" && !usingFixtures()) await new Promise((r) => setTimeout(r, 1000));
    });
  }

  const failed: PriceJobResult["failed"] = [];
  let updated = 0;
  let itemsUpdated = 0;
  let alertsFired = 0;
  const now = new Date();

  await db.transaction(async (tx) => {
    if (fetchedRate) await tx.update(settings).set({ eurUsdPpm: fetchedRate, eurUsdUpdatedAt: now }).where(eq(settings.id, 1));

    for (const p of products) {
      const res = fetched.get(`${p.provider}|${p.externalId}`);
      const price = res && !(res instanceof Error) ? usdFor(res, p.priceField, rate) : null;
      if (!price) {
        const error = res instanceof Error ? res.message : "No price for this field today";
        failed.push({ label: `${p.productName ?? p.externalId} · ${p.label}`, error });
        await tx.update(marketProducts).set({ lastError: error }).where(eq(marketProducts.id, p.id));
        continue;
      }
      updated++;
      await tx
        .update(marketProducts)
        .set({
          lastPriceCents: price.usd,
          lastNativeCents: price.native,
          lastFetchedAt: now,
          lastError: null,
          ...(res && !(res instanceof Error) && res.imageUrl && !p.imageUrl ? { imageUrl: res.imageUrl } : {}),
        })
        .where(eq(marketProducts.id, p.id));
      await tx
        .insert(priceSnapshots)
        .values({ productId: p.id, onDate: asOf, priceCents: price.usd, nativeCents: price.native, currency: price.currency, fetchedAt: now })
        .onConflictDoUpdate({
          target: [priceSnapshots.productId, priceSnapshots.onDate],
          set: { priceCents: price.usd, nativeCents: price.native, currency: price.currency, fetchedAt: now },
        });
      const rows = await tx
        .update(inventoryItems)
        .set({ marketCents: price.usd, marketSource: p.label, marketUpdatedAt: now })
        .where(and(eq(inventoryItems.marketProductId, p.id), eq(inventoryItems.marketMode, "auto"), inArray(inventoryItems.status, ACTIVE_STATUSES)))
        .returning({ id: inventoryItems.id });
      itemsUpdated += rows.length;
    }

    // Each card's effective price today (feed or manual), for history and alerts.
    const active = await tx
      .select({
        id: inventoryItems.id,
        quantity: inventoryItems.quantity,
        marketCents: inventoryItems.marketCents,
        marketSource: inventoryItems.marketSource,
        purchaseCents: inventoryItems.purchaseCents,
        feesCents: inventoryItems.feesCents,
        shippingCents: inventoryItems.shippingCents,
        gradingCents: inventoryItems.gradingCents,
        cardName: cards.name,
      })
      .from(inventoryItems)
      .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
      .where(inArray(inventoryItems.status, ACTIVE_STATUSES));

    const priced = active.filter((a) => a.marketCents !== null);
    if (priced.length) {
      await tx
        .insert(itemPriceHistory)
        .values(priced.map((a) => ({ itemId: a.id, onDate: asOf, priceCents: a.marketCents!, source: a.marketSource ?? "Manual" })))
        .onConflictDoUpdate({
          target: [itemPriceHistory.itemId, itemPriceHistory.onDate],
          set: { priceCents: sql`excluded.price_cents`, source: sql`excluded.source` },
        });
    }

    const totals = active.reduce(
      (acc, a) => {
        const cost = costBasis(a);
        acc.cost += cost;
        acc.units += a.quantity;
        if (a.marketCents === null) acc.unpriced += 1;
        else {
          acc.market += a.marketCents * a.quantity;
          if (a.purchaseCents !== null) acc.pricedCost += cost;
        }
        return acc;
      },
      { cost: 0, market: 0, pricedCost: 0, units: 0, unpriced: 0 },
    );
    const snap = { costCents: totals.cost, marketCents: totals.market, pricedCostCents: totals.pricedCost, units: totals.units, unpricedRows: totals.unpriced };
    await tx
      .insert(inventoryValueSnapshots)
      .values({ onDate: asOf, ...snap })
      .onConflictDoUpdate({ target: inventoryValueSnapshots.onDate, set: snap });

    alertsFired = await evaluateAllAlerts(tx, { asOf, defaultBps: s.defaultAlertBps, defaultWindow: s.alertWindowDays, items: priced });

    await tx
      .update(settings)
      .set({
        priceJobLastRunAt: now,
        priceJobLastResult: { asOf, products: products.length, updated, failed: failed.length, itemsUpdated, alertsFired },
      })
      .where(eq(settings.id, 1));
  });

  return { asOf, products: products.length, updated, failed, itemsUpdated, alertsFired, eurUsdPpm: rate, sample: usingFixtures(), ms: Date.now() - started };
}

type JobTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function evaluateAllAlerts(
  tx: JobTx,
  args: { asOf: string; defaultBps: number; defaultWindow: number; items: { id: string; cardName: string }[] },
): Promise<number> {
  if (!args.items.length) return 0;
  const ids = args.items.map((i) => i.id);
  const rules = await tx.select().from(priceAlerts).where(and(inArray(priceAlerts.itemId, ids), eq(priceAlerts.active, true)));
  const maxWindow = Math.max(args.defaultWindow, ...rules.map((r) => r.windowDays), 1);
  const since = addDays(args.asOf, -(maxWindow + 1));
  const history = await tx
    .select({ itemId: itemPriceHistory.itemId, onDate: itemPriceHistory.onDate, priceCents: itemPriceHistory.priceCents })
    .from(itemPriceHistory)
    .where(and(inArray(itemPriceHistory.itemId, ids), gte(itemPriceHistory.onDate, since)));
  const past = await tx
    .select({ itemId: alertEvents.itemId, alertId: alertEvents.alertId, kind: alertEvents.kind, onDate: alertEvents.onDate, ackAt: alertEvents.acknowledgedAt })
    .from(alertEvents)
    .where(and(inArray(alertEvents.itemId, ids), gte(alertEvents.onDate, addDays(args.asOf, -400))));

  const toInsert: (typeof alertEvents.$inferInsert)[] = [];
  for (const item of args.items) {
    const itemRules: AlertRule[] = rules
      .filter((r) => r.itemId === item.id)
      .map((r) => ({ id: r.id, kind: r.kind, thresholdBps: r.thresholdBps, windowDays: r.windowDays, targetCents: r.targetCents }));
    // The shop-wide ±X% rule applies unless the card has its own % rule.
    if (args.defaultBps > 0 && !itemRules.some((r) => r.kind === "move_pct")) {
      itemRules.push({ id: null, kind: "move_pct", thresholdBps: args.defaultBps, windowDays: args.defaultWindow, targetCents: null });
    }
    const fired = evaluateAlerts({
      cardName: item.cardName,
      today: args.asOf,
      history: history.filter((h) => h.itemId === item.id),
      rules: itemRules,
      pastEvents: past.filter((e) => e.itemId === item.id).map((e) => ({ alertId: e.alertId, kind: e.kind, onDate: e.onDate, acknowledged: e.ackAt !== null })),
    });
    // Don't fire the same rule twice on the same day (job can run more than once).
    for (const f of fired) {
      if (past.some((e) => e.itemId === item.id && e.alertId === f.alertId && e.kind === f.kind && e.onDate === args.asOf)) continue;
      toInsert.push({ itemId: item.id, alertId: f.alertId, kind: f.kind, onDate: args.asOf, fromCents: f.fromCents, toCents: f.toCents, changeBps: f.changeBps, message: f.message });
    }
  }
  if (toInsert.length) await tx.insert(alertEvents).values(toInsert);
  return toInsert.length;
}

/** Count of open (not dismissed) alerts — used by the nav badge. */
export async function openAlertCount(db: Db) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(alertEvents).where(isNull(alertEvents.acknowledgedAt));
  return r?.n ?? 0;
}
