import { describe, expect, it } from "vitest";
import { type EventSale, eventReport } from "./event-report";

const sale = (o: Partial<EventSale> & { price: number; cost: number; method?: EventSale["paymentMethod"]; card?: string; fees?: number }): EventSale => ({
  id: Math.random().toString(),
  saleNo: 1,
  priceCents: o.price,
  platformFeesCents: o.fees ?? 0,
  shippingCostCents: 0,
  paymentMethod: o.method ?? "cash",
  createdAt: "2026-11-14T15:00:00Z",
  lines: [{ cardId: o.card ?? "c1", cardName: o.card ?? "Charizard ex", quantity: 1, priceCents: o.price, costBasisCents: o.cost, costMissing: false }],
});

describe("end-of-show report", () => {
  it("adds up revenue, profit, payments and best sellers", () => {
    const r = eventReport({
      floatCents: 20000,
      countedCashCents: null,
      sales: [
        sale({ price: 80000, cost: 50000, card: "M Rayquaza EX" }),
        sale({ price: 3500, cost: 2000, method: "venmo", card: "Charizard ex" }),
        sale({ price: 3000, cost: 1000, method: "card", fees: 93, card: "Ash-Greninja EX" }),
      ],
      trades: [],
      buys: [],
      expenses: [{ amountCents: 15000, paymentMethod: "venmo", isTableFee: true }],
    });
    expect(r.salesCount).toBe(3);
    expect(r.cardsSold).toBe(3);
    expect(r.revenueCents).toBe(86500);
    expect(r.salesProfitCents).toBe(30000 + 1500 + 2000 - 93);
    expect(r.netProfitCents).toBe(r.grossProfitCents - 15000);
    expect(r.byPayment.map((p) => p.method)).toEqual(["cash", "venmo", "card"]);
    expect(r.bestSellers[0].cardName).toBe("M Rayquaza EX");
    expect(r.avgSaleCents).toBe(28833);
  });

  it("reconciles the cash box: float + cash in − cash out", () => {
    const r = eventReport({
      floatCents: 20000,
      countedCashCents: 108000,
      sales: [sale({ price: 80000, cost: 0 }), sale({ price: 3500, cost: 0, method: "zelle" })],
      trades: [{ cashInCents: 2000, cashOutCents: 0, paymentMethod: "cash", outValueCents: 5000, outCostCents: 3000 }],
      buys: [{ totalCents: 4000, paymentMethod: "cash", cards: 2 }, { totalCents: 9000, paymentMethod: "paypal", cards: 1 }],
      expenses: [
        { amountCents: 15000, paymentMethod: "venmo", isTableFee: true },
        { amountCents: 1200, paymentMethod: "cash", isTableFee: false },
      ],
    });
    // 200 + 800 (cash sale) + 20 (trade cash in) − 40 (cash buy) − 12 (cash expense) = 968
    expect(r.cash.expectedCashCents).toBe(96800);
    expect(r.cash.differenceCents).toBe(108000 - 96800);
    expect(r.cash.digitalInCents).toBe(3500);
    expect(r.cash.digitalOutCents).toBe(9000);
    expect(r.tradeProfitCents).toBe(2000);
    expect(r.buysCents).toBe(13000);
    expect(r.cardsBought).toBe(3);
  });

  it("handles an empty show", () => {
    const r = eventReport({ floatCents: 10000, countedCashCents: null, sales: [], trades: [], buys: [], expenses: [] });
    expect(r.cash.expectedCashCents).toBe(10000);
    expect(r.avgSaleCents).toBeNull();
    expect(r.marginBps).toBeNull();
  });
});
