import { describe, expect, it } from "vitest";
import { addDays, daysBetween, monthsBetween, resolvePeriod, todayISO } from "./dates";
import { computeMetrics, type Realization } from "./metrics";

const sale = (over: Partial<Realization>): Realization => ({
  kind: "sale",
  date: "2026-10-10",
  channel: "card_show",
  cardId: "c1",
  cardName: "Charizard ex",
  quantity: 1,
  revenueCents: 10000,
  feesCents: 0,
  shippingCents: 0,
  costBasisCents: 6000,
  costMissing: false,
  acquiredOn: "2026-09-10",
  ...over,
});

describe("dates", () => {
  it("resolves periods", () => {
    expect(resolvePeriod("month", undefined, undefined, "2026-10-16")).toMatchObject({ from: "2026-10-01", to: "2026-10-16" });
    expect(resolvePeriod("30d", undefined, undefined, "2026-10-16").from).toBe("2026-09-17");
    expect(resolvePeriod("ytd", undefined, undefined, "2026-10-16").from).toBe("2026-01-01");
    expect(resolvePeriod("all", undefined, undefined, "2026-10-16").from).toBeNull();
    expect(resolvePeriod("custom", "2026-10-05", "2026-10-01", "2026-10-16")).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("does calendar math", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(todayISO(new Date("2026-10-16T03:00:00Z"), "America/New_York")).toBe("2026-10-15");
  });
});

describe("dashboard metrics", () => {
  const period = resolvePeriod("month", undefined, undefined, "2026-10-16");

  it("computes revenue, gross and net profit, margin", () => {
    const m = computeMetrics({
      period,
      realizations: [
        sale({ revenueCents: 80000, feesCents: 1000, shippingCents: 500, costBasisCents: 50000 }),
        sale({ kind: "trade", channel: "instagram", cardId: "c2", cardName: "Pikachu V", revenueCents: 5000, costBasisCents: 2000 }),
        sale({ date: "2026-09-30", revenueCents: 99999 }), // outside the period
      ],
      expenses: [
        { date: "2026-10-02", amountCents: 7500 },
        { date: "2026-09-02", amountCents: 1 },
      ],
      stock: [],
      history: [],
      slowMoverDays: 60,
      today: "2026-10-16",
    });
    expect(m.salesRevenueCents).toBe(80000);
    expect(m.tradeValueCents).toBe(5000);
    expect(m.revenueCents).toBe(85000);
    expect(m.grossProfitCents).toBe(80000 - 1500 - 50000 + 3000);
    expect(m.netProfitCents).toBe(m.grossProfitCents - 7500);
    expect(m.marginBps).toBe(Math.round((m.netProfitCents / 85000) * 10000));
    expect(m.byChannel[0].channel).toBe("card_show");
    expect(m.topCards[0].cardName).toBe("Charizard ex");
  });

  it("computes inventory value, unrealized P/L on priced rows only, sell-through and days to sell", () => {
    const m = computeMetrics({
      period,
      realizations: [sale({ quantity: 2, acquiredOn: "2026-09-30", date: "2026-10-10" })],
      expenses: [],
      stock: [
        { id: "a", cardName: "A", quantity: 2, costBasisCents: 1000, marketCents: 900, acquiredOn: "2026-01-01" },
        { id: "b", cardName: "B", quantity: 1, costBasisCents: 5000, marketCents: null, acquiredOn: "2026-10-01" },
      ],
      history: [],
      slowMoverDays: 60,
      today: "2026-10-16",
    });
    expect(m.inventoryCostCents).toBe(6000);
    expect(m.inventoryMarketCents).toBe(1800);
    expect(m.unrealizedCents).toBe(800);
    expect(m.unpricedRows).toBe(1);
    expect(m.unitsInStock).toBe(3);
    expect(m.sellThroughBps).toBe(4000); // 2 sold / (2 + 3)
    expect(m.avgDaysToSell).toBe(10);
    expect(m.slowMovers.map((s) => s.id)).toEqual(["a"]);
  });

  it("flags sales whose cost was never entered", () => {
    const m = computeMetrics({
      period,
      realizations: [sale({ costMissing: true, costBasisCents: 0 })],
      expenses: [],
      stock: [],
      history: [],
      slowMoverDays: 60,
      today: "2026-10-16",
    });
    expect(m.costMissingSold).toBe(1);
  });

  it("rebuilds inventory value at cost over time", () => {
    const m = computeMetrics({
      period: resolvePeriod("all", undefined, undefined, "2026-10-16"),
      realizations: [],
      expenses: [],
      stock: [],
      history: [
        { acquiredOn: "2026-08-05", disposedOn: "2026-09-20", costBasisCents: 1000, active: false },
        { acquiredOn: "2026-09-01", disposedOn: null, costBasisCents: 500, active: true },
      ],
      slowMoverDays: 60,
      today: "2026-10-16",
    });
    const byMonth = Object.fromEntries(m.inventoryOverTime.map((p) => [p.month, p.costCents]));
    expect(byMonth["2026-08"]).toBe(1000);
    expect(byMonth["2026-09"]).toBe(500);
    expect(byMonth["2026-10"]).toBe(500);
  });
});
