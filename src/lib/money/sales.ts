import { allocate } from "./allocate";
import { applyBps, assertCents, type Bps, type Cents } from "./cents";

export type SaleLineInput = {
  /** Cost basis of the copies sold on this line (already split for partial quantity). */
  costBasisCents: Cents;
  /** Weight used to split a bundle price (market value or asking price), in cents. */
  weightCents?: Cents | null;
  /** For a manual bundle split: this line's price. */
  manualPriceCents?: Cents;
};

export type SaleInput = {
  priceCents: Cents;
  platformFeesCents: Cents;
  shippingCostCents: Cents;
  /** How to split a bundle price across lines. Ignored when there is one line. */
  split: "weight" | "manual" | "even";
  lines: SaleLineInput[];
};

export type SaleLineResult = {
  priceCents: Cents;
  feesCents: Cents;
  shippingCents: Cents;
  costBasisCents: Cents;
  profitCents: Cents;
};

export type SaleResult = {
  lines: SaleLineResult[];
  priceCents: Cents;
  netProceedsCents: Cents;
  costBasisCents: Cents;
  profitCents: Cents;
};

/**
 * Profit for a sale or bundle. Profit = price − platform fees − shipping − cost.
 * Bundles split the price by weight (market/asking value of each card),
 * evenly, or by manual line prices that must add up to the sale price.
 * Fees and shipping follow each line's share of the price.
 */
export function computeSale(input: SaleInput): SaleResult {
  const { priceCents, platformFeesCents, shippingCostCents, lines } = input;
  [priceCents, platformFeesCents, shippingCostCents].forEach((v) => assertCents(v));
  if (priceCents < 0) throw new Error("Sale price cannot be negative");
  if (platformFeesCents < 0 || shippingCostCents < 0) throw new Error("Fees and shipping cannot be negative");
  if (lines.length === 0) throw new Error("A sale needs at least one card");

  let prices: Cents[];
  if (lines.length === 1) {
    prices = [priceCents];
  } else if (input.split === "manual") {
    prices = lines.map((l) => {
      if (l.manualPriceCents === undefined) throw new Error("Enter a price for every card in the bundle");
      assertCents(l.manualPriceCents);
      return l.manualPriceCents;
    });
    const total = prices.reduce((a, b) => a + b, 0);
    if (total !== priceCents) throw new Error("Bundle line prices must add up to the sale price");
  } else if (input.split === "weight") {
    prices = allocate(
      priceCents,
      lines.map((l) => Math.max(l.weightCents ?? 0, 0)),
    );
  } else {
    prices = allocate(priceCents, lines.map(() => 1));
  }

  const weights = prices.map((p) => Math.max(p, 0));
  const fees = allocate(platformFeesCents, weights);
  const shipping = allocate(shippingCostCents, weights);

  const results = lines.map((l, i) => {
    assertCents(l.costBasisCents);
    const profitCents = prices[i] - fees[i] - shipping[i] - l.costBasisCents;
    return {
      priceCents: prices[i],
      feesCents: fees[i],
      shippingCents: shipping[i],
      costBasisCents: l.costBasisCents,
      profitCents,
    };
  });
  const costBasisCents = results.reduce((a, r) => a + r.costBasisCents, 0);
  const netProceedsCents = priceCents - platformFeesCents - shippingCostCents;
  return {
    lines: results,
    priceCents,
    netProceedsCents,
    costBasisCents,
    profitCents: netProceedsCents - costBasisCents,
  };
}

/** Estimated platform fee from a percentage + fixed fee (e.g. eBay 13.25% + $0.40). */
export function estimateFee(priceCents: Cents, pctBps: Bps, fixedCents: Cents): Cents {
  if (priceCents <= 0) return 0;
  return applyBps(priceCents, pctBps) + fixedCents;
}
