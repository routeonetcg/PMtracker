import { daysBetween, inPeriod, type ISODate, monthKey, monthsBetween, type Period } from "@/lib/dates";
import type { Channel } from "@/lib/labels";
import { ratioBps } from "@/lib/money";

/** Realized activity: one row per sold line or traded-away line. */
export type Realization = {
  kind: "sale" | "trade";
  date: ISODate;
  channel: Channel;
  cardId: string;
  cardName: string;
  quantity: number;
  /** Sale price share, or agreed trade value. */
  revenueCents: number;
  feesCents: number;
  shippingCents: number;
  costBasisCents: number;
  costMissing: boolean;
  acquiredOn: ISODate;
};

export type ExpenseLite = { date: ISODate; amountCents: number };

export type StockLite = {
  id: string;
  cardName: string;
  quantity: number;
  costBasisCents: number;
  /** Purchase price never entered: excluded from unrealized P/L. */
  costMissing?: boolean;
  marketCents: number | null;
  acquiredOn: ISODate;
};

/** Every inventory row ever, with when it left (sold/traded) — for value over time. */
export type HistoryLite = { acquiredOn: ISODate; disposedOn: ISODate | null; costBasisCents: number; active: boolean };

export type Metrics = {
  revenueCents: number;
  salesRevenueCents: number;
  tradeValueCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  marginBps: number | null;
  inventoryCostCents: number;
  inventoryMarketCents: number;
  /** Cost of the rows that have both a market price and a known cost (so P/L compares like with like). */
  pricedCostCents: number;
  unpricedRows: number;
  /** Rows left out of unrealized P/L because their cost is missing. */
  unrealizedExcludedRows: number;
  unrealizedCents: number;
  unitsInStock: number;
  unitsSold: number;
  sellThroughBps: number | null;
  avgDaysToSell: number | null;
  costMissingSold: number;
  monthly: { month: string; revenueCents: number; grossProfitCents: number; netProfitCents: number }[];
  byChannel: { channel: Channel; revenueCents: number; profitCents: number }[];
  topCards: { cardId: string; cardName: string; quantity: number; profitCents: number; revenueCents: number }[];
  slowMovers: (StockLite & { days: number })[];
  inventoryOverTime: { month: string; costCents: number }[];
};

export const profitOf = (r: Realization) => r.revenueCents - r.feesCents - r.shippingCents - r.costBasisCents;

export function computeMetrics(input: {
  period: Period;
  realizations: Realization[];
  expenses: ExpenseLite[];
  stock: StockLite[];
  history: HistoryLite[];
  slowMoverDays: number;
  today: ISODate;
}): Metrics {
  const { period, today } = input;
  const real = input.realizations.filter((r) => inPeriod(r.date, period));
  const exps = input.expenses.filter((e) => inPeriod(e.date, period));

  let salesRevenue = 0;
  let tradeValue = 0;
  let gross = 0;
  let unitsSold = 0;
  let dayUnits = 0;
  let costMissingSold = 0;
  for (const r of real) {
    if (r.kind === "sale") salesRevenue += r.revenueCents;
    else tradeValue += r.revenueCents;
    gross += profitOf(r);
    unitsSold += r.quantity;
    dayUnits += Math.max(0, daysBetween(r.acquiredOn, r.date)) * r.quantity;
    if (r.costMissing) costMissingSold += 1;
  }
  const revenue = salesRevenue + tradeValue;
  const expenses = exps.reduce((a, e) => a + e.amountCents, 0);
  const net = gross - expenses;

  let invCost = 0;
  let invMarket = 0;
  let pricedCost = 0;
  let pricedMarket = 0;
  let unpriced = 0;
  let excluded = 0;
  let units = 0;
  for (const s of input.stock) {
    invCost += s.costBasisCents;
    units += s.quantity;
    if (s.marketCents === null) {
      unpriced += 1;
      continue;
    }
    invMarket += s.marketCents * s.quantity;
    if (s.costMissing) excluded += 1;
    else {
      pricedMarket += s.marketCents * s.quantity;
      pricedCost += s.costBasisCents;
    }
  }

  // Months to chart: the period's months, or for "all time" from the first activity (max 24).
  const firstActivity = [...input.realizations.map((r) => r.date), ...input.expenses.map((e) => e.date), ...input.history.map((h) => h.acquiredOn)]
    .sort()[0];
  const from = period.from ?? firstActivity ?? today;
  let months = monthsBetween(from, period.to);
  if (months.length > 24) months = months.slice(-24);
  if (months.length < 6) months = monthsBetween(shiftMonths(period.to, -5), period.to);

  const monthly = months.map((m) => {
    const rs = input.realizations.filter((r) => monthKey(r.date) === m);
    const g = rs.reduce((a, r) => a + profitOf(r), 0);
    const e = input.expenses.filter((x) => monthKey(x.date) === m).reduce((a, x) => a + x.amountCents, 0);
    return { month: m, revenueCents: rs.reduce((a, r) => a + r.revenueCents, 0), grossProfitCents: g, netProfitCents: g - e };
  });

  const channelMap = new Map<Channel, { revenueCents: number; profitCents: number }>();
  for (const r of real) {
    const c = channelMap.get(r.channel) ?? { revenueCents: 0, profitCents: 0 };
    c.revenueCents += r.revenueCents;
    c.profitCents += profitOf(r);
    channelMap.set(r.channel, c);
  }

  const cardMap = new Map<string, { cardId: string; cardName: string; quantity: number; profitCents: number; revenueCents: number }>();
  for (const r of real) {
    const c = cardMap.get(r.cardId) ?? { cardId: r.cardId, cardName: r.cardName, quantity: 0, profitCents: 0, revenueCents: 0 };
    c.quantity += r.quantity;
    c.profitCents += profitOf(r);
    c.revenueCents += r.revenueCents;
    cardMap.set(r.cardId, c);
  }

  const slowMovers = input.stock
    .map((s) => ({ ...s, days: daysBetween(s.acquiredOn, today) }))
    .filter((s) => s.days > input.slowMoverDays)
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  const inventoryOverTime = months.map((m) => {
    const end = endOfMonth(m) < today ? endOfMonth(m) : today;
    const cost = input.history
      .filter((h) => h.acquiredOn <= end && (h.disposedOn === null ? h.active : h.disposedOn > end))
      .reduce((a, h) => a + h.costBasisCents, 0);
    return { month: m, costCents: cost };
  });

  return {
    revenueCents: revenue,
    salesRevenueCents: salesRevenue,
    tradeValueCents: tradeValue,
    grossProfitCents: gross,
    expensesCents: expenses,
    netProfitCents: net,
    marginBps: ratioBps(net, revenue),
    inventoryCostCents: invCost,
    inventoryMarketCents: invMarket,
    pricedCostCents: pricedCost,
    unpricedRows: unpriced,
    unrealizedExcludedRows: excluded,
    unrealizedCents: pricedMarket - pricedCost,
    unitsInStock: units,
    unitsSold,
    sellThroughBps: ratioBps(unitsSold, unitsSold + units),
    avgDaysToSell: unitsSold ? Math.round(dayUnits / unitsSold) : null,
    costMissingSold,
    monthly,
    byChannel: [...channelMap.entries()]
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.profitCents - a.profitCents),
    topCards: [...cardMap.values()].sort((a, b) => b.profitCents - a.profitCents).slice(0, 10),
    slowMovers,
    inventoryOverTime,
  };
}

function shiftMonths(d: ISODate, n: number): ISODate {
  const [y, m] = d.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

function endOfMonth(month: string): ISODate {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
