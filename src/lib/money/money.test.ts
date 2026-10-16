import { describe, expect, it } from "vitest";
import {
  allocate,
  allocateByBps,
  allocateEvenly,
  applyBps,
  askingFromMarkup,
  cashByHolder,
  centsToInput,
  changeBps,
  computeSale,
  computeTrade,
  costBasis,
  effectiveAsking,
  estimateFee,
  formatBps,
  formatUSD,
  gradingCostPerCard,
  isCostMissing,
  mulDivRound,
  parseDollars,
  parsePercentToBps,
  partnerBalances,
  ratioBps,
  reconcileCash,
  settleUp,
  splitLot,
  splitProfit,
  splitRowCost,
  unrealized,
} from "./index";

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("cents helpers", () => {
  it("parses dollar strings without floating point", () => {
    expect(parseDollars("35")).toBe(3500);
    expect(parseDollars("$1,234.5")).toBe(123450);
    expect(parseDollars("0.07")).toBe(7);
    expect(parseDollars(".5")).toBe(50);
    expect(parseDollars("-12.07")).toBe(-1207);
    expect(parseDollars("19.999")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("")).toBeNull();
    expect(parseDollars(null)).toBeNull();
  });

  it("parses percentages into basis points", () => {
    expect(parsePercentToBps("50")).toBe(5000);
    expect(parsePercentToBps("12.5%")).toBe(1250);
    expect(parsePercentToBps("-3.25")).toBe(-325);
    expect(parsePercentToBps("x")).toBeNull();
  });

  it("rounds half away from zero", () => {
    expect(mulDivRound(5, 1, 2)).toBe(3);
    expect(mulDivRound(-5, 1, 2)).toBe(-3);
    expect(mulDivRound(4, 1, 3)).toBe(1);
    expect(applyBps(1999, 1325)).toBe(265); // 264.87 -> 265
    expect(applyBps(10, 5000)).toBe(5);
  });

  it("formats USD and percentages", () => {
    expect(formatUSD(80000)).toBe("$800.00");
    expect(formatUSD(80000, { whole: true })).toBe("$800");
    expect(formatUSD(-1234)).toBe("-$12.34");
    expect(formatUSD(500, { signed: true })).toBe("+$5.00");
    expect(formatUSD(null)).toBe("—");
    expect(centsToInput(3505)).toBe("35.05");
    expect(centsToInput(-7)).toBe("-0.07");
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(-333, 0)).toBe("-3%");
    expect(ratioBps(1, 3)).toBe(3333);
    expect(ratioBps(1, 0)).toBeNull();
  });

  it("rejects fractional cents", () => {
    expect(() => allocate(10.5, [1, 1])).toThrow();
  });
});

describe("allocate (largest remainder)", () => {
  it("always sums to the total", () => {
    expect(allocateEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(sumOf(allocate(99_999, [7, 13, 29, 51]))).toBe(99_999);
  });

  it("splits proportionally to weights", () => {
    expect(allocate(1000, [1, 3])).toEqual([250, 750]);
    expect(allocate(1001, [1, 3])).toEqual([250, 751]);
  });

  it("splits negative totals symmetrically", () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("splits evenly when all weights are zero", () => {
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
  });

  it("gives nothing to zero-weight parts", () => {
    expect(allocate(1000, [0, 1])).toEqual([0, 1000]);
  });

  it("validates percentages add up to 100%", () => {
    expect(allocateByBps(10000, [5000, 5000])).toEqual([5000, 5000]);
    expect(allocateByBps(101, [3333, 3333, 3334])).toEqual([34, 33, 34].map((x, i) => [34, 33, 34][i]));
    expect(sumOf(allocateByBps(101, [3333, 3333, 3334]))).toBe(101);
    expect(() => allocateByBps(100, [5000, 4000])).toThrow(/100%/);
  });
});

describe("cost basis", () => {
  it("adds purchase, fees, shipping and grading", () => {
    expect(costBasis({ purchaseCents: 5000, feesCents: 150, shippingCents: 500, gradingCents: 2500 })).toBe(8150);
  });

  it("treats a missing purchase price as 0 but flags it", () => {
    const c = { purchaseCents: null, feesCents: 0, shippingCents: 0, gradingCents: 0 };
    expect(costBasis(c)).toBe(0);
    expect(isCostMissing(c)).toBe(true);
  });

  it("splits a row by quantity and the halves add back up", () => {
    const cost = { purchaseCents: 1000, feesCents: 101, shippingCents: 7, gradingCents: 0 };
    const { taken, remaining } = splitRowCost(cost, 3, 1);
    expect(taken).toEqual({ purchaseCents: 333, feesCents: 34, shippingCents: 2, gradingCents: 0 });
    expect(remaining).toEqual({ purchaseCents: 667, feesCents: 67, shippingCents: 5, gradingCents: 0 });
    expect(costBasis(taken) + costBasis(remaining)).toBe(costBasis(cost));
  });

  it("keeps a missing cost missing when splitting", () => {
    const { taken, remaining } = splitRowCost(
      { purchaseCents: null, feesCents: 0, shippingCents: 0, gradingCents: 0 },
      2,
      1,
    );
    expect(taken.purchaseCents).toBeNull();
    expect(remaining.purchaseCents).toBeNull();
  });

  it("rejects taking more than the row has", () => {
    expect(() => splitRowCost({ purchaseCents: 1, feesCents: 0, shippingCents: 0, gradingCents: 0 }, 2, 3)).toThrow();
  });
});

describe("bulk lot splits", () => {
  it("splits by percentage, with fees and shipping following the same shares", () => {
    const res = splitLot({
      priceCents: 100000,
      feesCents: 300,
      shippingCents: 1001,
      method: "percent",
      lines: [
        { quantity: 1, shareBps: 6000 },
        { quantity: 1, shareBps: 2500 },
        { quantity: 1, shareBps: 1500 },
      ],
    });
    expect(res.map((r) => r.purchaseCents)).toEqual([60000, 25000, 15000]);
    expect(sumOf(res.map((r) => r.feesCents))).toBe(300);
    expect(sumOf(res.map((r) => r.shippingCents))).toBe(1001);
    expect(sumOf(res.map(costBasis))).toBe(100000 + 300 + 1001);
  });

  it("rejects percentages that don't add to 100%", () => {
    expect(() =>
      splitLot({
        priceCents: 1000,
        feesCents: 0,
        shippingCents: 0,
        method: "percent",
        lines: [{ quantity: 1, shareBps: 5000 }, { quantity: 1, shareBps: 4000 }],
      }),
    ).toThrow(/100%/);
  });

  it("splits by market value × quantity", () => {
    // $300 lot: Charizard $200 market, 4× Pikachu at $25 each ($100)
    const res = splitLot({
      priceCents: 30000,
      feesCents: 0,
      shippingCents: 0,
      method: "market_value",
      lines: [
        { quantity: 1, unitMarketCents: 20000 },
        { quantity: 4, unitMarketCents: 2500 },
      ],
    });
    expect(res.map((r) => r.purchaseCents)).toEqual([20000, 10000]);
  });

  it("handles awkward market-value remainders exactly", () => {
    const res = splitLot({
      priceCents: 10000,
      feesCents: 0,
      shippingCents: 0,
      method: "market_value",
      lines: [{ quantity: 1, unitMarketCents: 1 }, { quantity: 1, unitMarketCents: 1 }, { quantity: 1, unitMarketCents: 1 }],
    });
    expect(res.map((r) => r.purchaseCents)).toEqual([3334, 3333, 3333]);
  });

  it("requires a market value on every line for a market split", () => {
    expect(() =>
      splitLot({ priceCents: 100, feesCents: 0, shippingCents: 0, method: "market_value", lines: [{ quantity: 1 }] }),
    ).toThrow(/market value/);
  });

  it("manual splits must add up to the lot price", () => {
    const res = splitLot({
      priceCents: 5000,
      feesCents: 100,
      shippingCents: 0,
      method: "manual",
      lines: [{ quantity: 1, manualCents: 4000 }, { quantity: 1, manualCents: 1000 }],
    });
    expect(res.map((r) => r.feesCents)).toEqual([80, 20]);
    expect(() =>
      splitLot({
        priceCents: 5000,
        feesCents: 0,
        shippingCents: 0,
        method: "manual",
        lines: [{ quantity: 1, manualCents: 4000 }],
      }),
    ).toThrow();
  });

  it("even split goes by quantity", () => {
    const res = splitLot({
      priceCents: 1000,
      feesCents: 0,
      shippingCents: 0,
      method: "even",
      lines: [{ quantity: 3 }, { quantity: 1 }],
    });
    expect(res.map((r) => r.purchaseCents)).toEqual([750, 250]);
  });
});

describe("asking price and unrealized P/L", () => {
  it("applies markup to market", () => {
    expect(askingFromMarkup(10000, 1500)).toBe(11500);
    expect(askingFromMarkup(3333, 1000)).toBe(3666); // 3666.3
    expect(askingFromMarkup(3333, 1000, 100)).toBe(3700); // round up to whole dollar
    expect(askingFromMarkup(10000, -1000)).toBe(9000); // discount
  });

  it("picks manual or markup asking", () => {
    expect(effectiveAsking({ askingMode: "manual", askingCents: 80000, markupBps: null, marketCents: null })).toBe(80000);
    expect(effectiveAsking({ askingMode: "markup", askingCents: null, markupBps: 2000, marketCents: 5000 })).toBe(6000);
    expect(effectiveAsking({ askingMode: "markup", askingCents: null, markupBps: 2000, marketCents: null })).toBeNull();
  });

  it("computes unrealized P/L and change", () => {
    expect(unrealized(5000, 2, 7000)).toBe(3000);
    expect(unrealized(null, 1, 7000)).toBeNull();
    expect(changeBps(10000, 11000)).toBe(1000);
    expect(changeBps(10000, 9000)).toBe(-1000);
    expect(changeBps(0, 9000)).toBeNull();
  });
});

describe("sales", () => {
  it("profit = price − fees − shipping − cost", () => {
    const r = computeSale({
      priceCents: 80000,
      platformFeesCents: 10640,
      shippingCostCents: 500,
      split: "weight",
      lines: [{ costBasisCents: 50000 }],
    });
    expect(r.profitCents).toBe(80000 - 10640 - 500 - 50000);
    expect(r.netProceedsCents).toBe(68860);
    expect(r.lines[0].profitCents).toBe(r.profitCents);
  });

  it("can make a loss", () => {
    const r = computeSale({ priceCents: 1000, platformFeesCents: 0, shippingCostCents: 0, split: "even", lines: [{ costBasisCents: 2500 }] });
    expect(r.profitCents).toBe(-1500);
  });

  it("splits a bundle by market weight and line profits add up", () => {
    const r = computeSale({
      priceCents: 10000,
      platformFeesCents: 1001,
      shippingCostCents: 0,
      split: "weight",
      lines: [
        { costBasisCents: 3000, weightCents: 6000 },
        { costBasisCents: 1000, weightCents: 3000 },
        { costBasisCents: 500, weightCents: 1000 },
      ],
    });
    expect(r.lines.map((l) => l.priceCents)).toEqual([6000, 3000, 1000]);
    expect(sumOf(r.lines.map((l) => l.feesCents))).toBe(1001);
    expect(sumOf(r.lines.map((l) => l.profitCents))).toBe(r.profitCents);
    expect(r.profitCents).toBe(10000 - 1001 - 4500);
  });

  it("manual bundle prices must match the sale price", () => {
    expect(() =>
      computeSale({
        priceCents: 1000,
        platformFeesCents: 0,
        shippingCostCents: 0,
        split: "manual",
        lines: [{ costBasisCents: 0, manualPriceCents: 400 }, { costBasisCents: 0, manualPriceCents: 500 }],
      }),
    ).toThrow();
  });

  it("validates inputs", () => {
    expect(() => computeSale({ priceCents: -1, platformFeesCents: 0, shippingCostCents: 0, split: "even", lines: [{ costBasisCents: 0 }] })).toThrow();
    expect(() => computeSale({ priceCents: 1, platformFeesCents: 0, shippingCostCents: 0, split: "even", lines: [] })).toThrow();
  });

  it("estimates platform fees with integer math", () => {
    expect(estimateFee(10000, 1325, 40)).toBe(1365);
    expect(estimateFee(0, 1325, 40)).toBe(0);
  });
});

describe("trades", () => {
  it("balanced trade: incoming cost = agreed value, outgoing realizes profit", () => {
    const r = computeTrade({
      out: [{ agreedValueCents: 10000, costBasisCents: 5000 }],
      in: [{ agreedValueCents: 6000 }, { agreedValueCents: 4000 }],
      cashInCents: 0,
      cashOutCents: 0,
    });
    expect(r.realizedProfitCents).toBe(5000);
    expect(r.inCostCents).toEqual([6000, 4000]);
    expect(r.imbalanceCents).toBe(0);
  });

  it("we add cash: incoming cost includes the cash paid", () => {
    const r = computeTrade({
      out: [{ agreedValueCents: 10000, costBasisCents: 5000 }],
      in: [{ agreedValueCents: 12000 }],
      cashInCents: 0,
      cashOutCents: 2000,
    });
    expect(r.inCostCents).toEqual([12000]);
    expect(r.realizedProfitCents).toBe(5000);
  });

  it("they add cash: incoming cost is reduced by the cash received", () => {
    const r = computeTrade({
      out: [{ agreedValueCents: 10000, costBasisCents: 8000 }],
      in: [{ agreedValueCents: 7000 }],
      cashInCents: 3000,
      cashOutCents: 0,
    });
    expect(r.inCostCents).toEqual([7000]);
    expect(r.realizedProfitCents).toBe(2000);
  });

  it("unbalanced values never create phantom profit", () => {
    // We value their card at $120 but only gave $100 of cards: their card costs us $100.
    const r = computeTrade({
      out: [{ agreedValueCents: 10000, costBasisCents: 10000 }],
      in: [{ agreedValueCents: 12000 }],
      cashInCents: 0,
      cashOutCents: 0,
    });
    expect(r.inCostCents).toEqual([10000]);
    expect(r.realizedProfitCents).toBe(0);
    expect(r.imbalanceCents).toBe(2000);
  });

  it("buying cards with cash only via a trade", () => {
    const r = computeTrade({ out: [], in: [{ agreedValueCents: 1 }, { agreedValueCents: 2 }], cashInCents: 0, cashOutCents: 1000 });
    expect(r.inCostCents).toEqual([333, 667]);
  });

  it("splits incoming cost with remainders that add up", () => {
    const r = computeTrade({
      out: [{ agreedValueCents: 10000, costBasisCents: 0 }],
      in: [{ agreedValueCents: 1 }, { agreedValueCents: 1 }, { agreedValueCents: 1 }],
      cashInCents: 0,
      cashOutCents: 0,
    });
    expect(sumOf(r.inCostCents)).toBe(10000);
  });
});

describe("grading", () => {
  it("adds per-card fee plus an even share of shipping", () => {
    expect(gradingCostPerCard(3, 2500, 1000)).toEqual([2834, 2833, 2833]);
    expect(gradingCostPerCard(2, 2500, 0, [0, 5000])).toEqual([2500, 7500]);
    expect(() => gradingCostPerCard(0, 2500, 0)).toThrow();
  });
});

describe("event cash", () => {
  it("expected cash = float + cash in − cash out", () => {
    const r = reconcileCash(
      20000,
      [
        { method: "cash", amountCents: 3500 },
        { method: "cash", amountCents: 80000 },
        { method: "digital", amountCents: 3000 },
        { method: "cash", amountCents: -5000 },
      ],
      98000,
    );
    expect(r.expectedCashCents).toBe(20000 + 83500 - 5000);
    expect(r.digitalInCents).toBe(3000);
    expect(r.differenceCents).toBe(98000 - 98500);
  });
});

describe("partners", () => {
  const partners = [
    { partnerId: "a", splitBps: 5000 },
    { partnerId: "b", splitBps: 5000 },
  ];

  it("splits profit 50/50 and gives the odd cent deterministically", () => {
    expect(splitProfit(10001, partners)).toEqual([5001, 5000]);
    expect(splitProfit(-101, partners)).toEqual([-51, -50]);
    expect(() => splitProfit(100, [{ partnerId: "a", splitBps: 6000 }])).toThrow();
  });

  it("claims = contributed − drawn + profit share", () => {
    const res = partnerBalances(20000, partners, [
      { partnerId: "a", contributedCents: 100000, drawnCents: 5000 },
      { partnerId: "b", contributedCents: 50000, drawnCents: 0 },
    ]);
    expect(res[0].claimCents).toBe(100000 - 5000 + 10000);
    expect(res[1].claimCents).toBe(50000 + 10000);
  });

  it("supports uneven splits", () => {
    expect(splitProfit(10000, [{ partnerId: "a", splitBps: 6000 }, { partnerId: "b", splitBps: 4000 }])).toEqual([6000, 4000]);
  });

  it("tracks cash by holder", () => {
    const cash = cashByHolder(
      ["a", "b", "biz"],
      [
        { kind: "contribution", holderId: "biz", amountCents: 100000 },
        { kind: "purchase", holderId: "biz", amountCents: 30000 },
        { kind: "sale", holderId: "a", netProceedsCents: 50000 },
        { kind: "expense", holderId: "b", amountCents: 7500 },
        { kind: "transfer", fromHolderId: "a", toHolderId: "biz", amountCents: 20000 },
        { kind: "trade_cash", holderId: "b", cashInCents: 1000, cashOutCents: 0 },
        { kind: "draw", holderId: "biz", amountCents: 5000 },
      ],
    );
    expect(cash.get("a")).toBe(30000);
    expect(cash.get("b")).toBe(-6500);
    expect(cash.get("biz")).toBe(85000);
  });

  it("books balance: total holdings equal total claims, and settle-up sums to zero", () => {
    // A contributes $1,000 into the business account; B contributes $500 cash he keeps.
    // Business buys a card for $600; A sells it at a show for $1,000 cash; B pays a $100 table fee.
    const netProfit = 100000 - 60000 - 10000; // $300
    const balances = partnerBalances(netProfit, partners, [
      { partnerId: "a", contributedCents: 100000, drawnCents: 0 },
      { partnerId: "b", contributedCents: 50000, drawnCents: 0 },
    ]);
    const cash = cashByHolder(
      ["ha", "hb", "biz"],
      [
        { kind: "contribution", holderId: "biz", amountCents: 100000 },
        { kind: "contribution", holderId: "hb", amountCents: 50000 },
        { kind: "purchase", holderId: "biz", amountCents: 60000 },
        { kind: "sale", holderId: "ha", netProceedsCents: 100000 },
        { kind: "expense", holderId: "hb", amountCents: 10000 },
      ],
    );
    const totalHoldings = [...cash.values()].reduce((a, b) => a + b, 0);
    expect(totalHoldings).toBe(sumOf(balances.map((b) => b.claimCents)));

    const rows = settleUp({
      partners: [
        { ...partners[0], claimCents: balances[0].claimCents, holderId: "ha" },
        { ...partners[1], claimCents: balances[1].claimCents, holderId: "hb" },
      ],
      holdingsByHolder: cash,
      businessHolderId: "biz",
    });
    expect(sumOf(rows.map((r) => r.excessCents))).toBe(0);
    // A holds the $1,000 show cash: claim 1150, biz share 200 → should hold 950 → owes B $50.
    expect(rows[0].excessCents).toBe(5000);
    expect(rows[1].excessCents).toBe(-5000);
  });
});
