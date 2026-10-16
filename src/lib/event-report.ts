import type { PaymentMethod } from "@/lib/labels";
import { type CashReconciliation, mulDivRound, ratioBps, reconcileCash } from "@/lib/money";

export const isCash = (m: PaymentMethod | null | undefined) => m === "cash";

export type EventSale = {
  id: string;
  saleNo: number;
  priceCents: number;
  platformFeesCents: number;
  shippingCostCents: number;
  paymentMethod: PaymentMethod;
  createdAt: Date | string;
  lines: { cardId: string; cardName: string; quantity: number; priceCents: number; costBasisCents: number; costMissing: boolean }[];
};
export type EventTrade = {
  cashInCents: number;
  cashOutCents: number;
  paymentMethod: PaymentMethod;
  outValueCents: number;
  outCostCents: number;
};
export type EventBuy = { totalCents: number; paymentMethod: PaymentMethod | null; cards: number };
export type EventExpense = { amountCents: number; paymentMethod: PaymentMethod | null; isTableFee: boolean };

export type EventReport = {
  salesCount: number;
  cardsSold: number;
  revenueCents: number;
  feesCents: number;
  salesProfitCents: number;
  tradeValueCents: number;
  tradeProfitCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  marginBps: number | null;
  avgSaleCents: number | null;
  costMissingLines: number;
  buysCents: number;
  cardsBought: number;
  byPayment: { method: PaymentMethod; count: number; cents: number }[];
  bestSellers: { cardId: string; cardName: string; quantity: number; revenueCents: number; profitCents: number }[];
  cash: CashReconciliation;
};

/**
 * End-of-show numbers. Cash in the box = float + cash sales + cash received in
 * trades − cash paid for buys, trades and expenses at the show. Expenses linked
 * to the event (table fee included) come off net profit whichever way they were paid.
 */
export function eventReport(input: {
  floatCents: number;
  countedCashCents: number | null;
  sales: EventSale[];
  trades: EventTrade[];
  buys: EventBuy[];
  expenses: EventExpense[];
}): EventReport {
  const { sales, trades, buys, expenses } = input;
  let revenue = 0;
  let fees = 0;
  let salesProfit = 0;
  let cardsSold = 0;
  let costMissing = 0;
  const pay = new Map<PaymentMethod, { count: number; cents: number }>();
  const cards = new Map<string, EventReport["bestSellers"][number]>();

  for (const s of sales) {
    revenue += s.priceCents;
    fees += s.platformFeesCents + s.shippingCostCents;
    const cost = s.lines.reduce((a, l) => a + l.costBasisCents, 0);
    salesProfit += s.priceCents - s.platformFeesCents - s.shippingCostCents - cost;
    const p = pay.get(s.paymentMethod) ?? { count: 0, cents: 0 };
    p.count += 1;
    p.cents += s.priceCents;
    pay.set(s.paymentMethod, p);
    for (const l of s.lines) {
      cardsSold += l.quantity;
      if (l.costMissing) costMissing += 1;
      const c = cards.get(l.cardId) ?? { cardId: l.cardId, cardName: l.cardName, quantity: 0, revenueCents: 0, profitCents: 0 };
      c.quantity += l.quantity;
      c.revenueCents += l.priceCents;
      // Fees/shipping are per sale; share them by this line's part of the price.
      const share = s.priceCents ? mulDivRound(s.platformFeesCents + s.shippingCostCents, l.priceCents, s.priceCents) : 0;
      c.profitCents += l.priceCents - share - l.costBasisCents;
      cards.set(l.cardId, c);
    }
  }

  const tradeValue = trades.reduce((a, t) => a + t.outValueCents, 0);
  const tradeProfit = trades.reduce((a, t) => a + t.outValueCents - t.outCostCents, 0);
  const expensesTotal = expenses.reduce((a, e) => a + e.amountCents, 0);
  const gross = salesProfit + tradeProfit;
  const net = gross - expensesTotal;

  const movements = [
    ...sales.map((s) => ({ method: isCash(s.paymentMethod) ? ("cash" as const) : ("digital" as const), amountCents: s.priceCents })),
    ...trades.flatMap((t) => {
      const method = isCash(t.paymentMethod) ? ("cash" as const) : ("digital" as const);
      return [
        ...(t.cashInCents ? [{ method, amountCents: t.cashInCents }] : []),
        ...(t.cashOutCents ? [{ method, amountCents: -t.cashOutCents }] : []),
      ];
    }),
    ...buys.map((b) => ({ method: isCash(b.paymentMethod) ? ("cash" as const) : ("digital" as const), amountCents: -b.totalCents })),
    // Table fees are usually paid before the show, so only expenses paid in cash at the show leave the box.
    ...expenses.filter((e) => isCash(e.paymentMethod)).map((e) => ({ method: "cash" as const, amountCents: -e.amountCents })),
  ];

  return {
    salesCount: sales.length,
    cardsSold,
    revenueCents: revenue,
    feesCents: fees,
    salesProfitCents: salesProfit,
    tradeValueCents: tradeValue,
    tradeProfitCents: tradeProfit,
    grossProfitCents: gross,
    expensesCents: expensesTotal,
    netProfitCents: net,
    marginBps: ratioBps(net, revenue + tradeValue),
    avgSaleCents: sales.length ? mulDivRound(revenue, 1, sales.length) : null,
    costMissingLines: costMissing,
    buysCents: buys.reduce((a, b) => a + b.totalCents, 0),
    cardsBought: buys.reduce((a, b) => a + b.cards, 0),
    byPayment: [...pay.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.cents - a.cents),
    bestSellers: [...cards.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    cash: reconcileCash(input.floatCents, movements, input.countedCashCents),
  };
}
