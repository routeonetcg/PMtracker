import { allocate, allocateByBps } from "./allocate";
import { assertCents, type Bps, type Cents } from "./cents";

/** The four parts of an inventory row's cost basis, as row totals in cents. */
export type CostComponents = {
  /** null = cost not entered yet ("cost missing"). */
  purchaseCents: Cents | null;
  feesCents: Cents;
  shippingCents: Cents;
  gradingCents: Cents;
};

export const ZERO_COST: CostComponents = {
  purchaseCents: 0,
  feesCents: 0,
  shippingCents: 0,
  gradingCents: 0,
};

export function costBasis(c: CostComponents): Cents {
  return (c.purchaseCents ?? 0) + c.feesCents + c.shippingCents + c.gradingCents;
}

export function isCostMissing(c: Pick<CostComponents, "purchaseCents">): boolean {
  return c.purchaseCents === null;
}

function splitNullable(total: Cents | null, weights: number[]): (Cents | null)[] {
  if (total === null) return weights.map(() => null);
  return allocate(total, weights);
}

/**
 * Split an inventory row of `quantity` copies into two rows: `take` copies and
 * the remaining copies. Each cost component is allocated by quantity so the
 * two rows always add back to the original exactly.
 */
export function splitRowCost(
  cost: CostComponents,
  quantity: number,
  take: number,
): { taken: CostComponents; remaining: CostComponents } {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1");
  if (!Number.isInteger(take) || take < 1 || take > quantity) {
    throw new Error(`Can only take between 1 and ${quantity}`);
  }
  if (take === quantity) return { taken: { ...cost }, remaining: { ...ZERO_COST } };
  const weights = [take, quantity - take];
  const [pT, pR] = splitNullable(cost.purchaseCents, weights);
  const [fT, fR] = allocate(cost.feesCents, weights);
  const [sT, sR] = allocate(cost.shippingCents, weights);
  const [gT, gR] = allocate(cost.gradingCents, weights);
  return {
    taken: { purchaseCents: pT, feesCents: fT, shippingCents: sT, gradingCents: gT },
    remaining: { purchaseCents: pR, feesCents: fR, shippingCents: sR, gradingCents: gR },
  };
}

export type LotLine = {
  quantity: number;
  /** For split by percent: this line's share of the lot in basis points. */
  shareBps?: Bps;
  /** For split by market value: market value of ONE copy, in cents. */
  unitMarketCents?: Cents;
  /** For manual split: this line's purchase price in cents. */
  manualCents?: Cents;
};

export type LotSplitMethod = "percent" | "market_value" | "manual" | "even";

export type LotInput = {
  priceCents: Cents;
  feesCents: Cents;
  shippingCents: Cents;
  method: LotSplitMethod;
  lines: LotLine[];
};

/**
 * Allocate a bulk-lot purchase (one price + fees + shipping) across its lines.
 * - percent: shares must add up to 100%.
 * - market_value: weight = unit market × quantity. Lines with no market value
 *   get nothing, so every line in a market split needs a market value.
 * - manual: line prices must add up to the lot price; fees/shipping follow them.
 * - even: by quantity.
 * Fees and shipping always follow the same weights as the price.
 */
export function splitLot(input: LotInput): CostComponents[] {
  const { priceCents, feesCents, shippingCents, method, lines } = input;
  [priceCents, feesCents, shippingCents].forEach((v) => assertCents(v));
  if (lines.length === 0) throw new Error("A lot needs at least one card");
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Every line needs a quantity of at least 1");
  }

  let prices: Cents[];
  let weights: number[];
  switch (method) {
    case "percent": {
      const bps = lines.map((l) => l.shareBps ?? 0);
      prices = allocateByBps(priceCents, bps);
      weights = bps;
      break;
    }
    case "market_value": {
      weights = lines.map((l) => {
        if (l.unitMarketCents === undefined || l.unitMarketCents === null) {
          throw new Error("Every card needs a market value to split by market value");
        }
        if (l.unitMarketCents < 0) throw new Error("Market values cannot be negative");
        return l.unitMarketCents * l.quantity;
      });
      if (weights.every((w) => w === 0)) throw new Error("At least one card needs a market value above $0");
      prices = allocate(priceCents, weights);
      break;
    }
    case "manual": {
      prices = lines.map((l) => {
        if (l.manualCents === undefined) throw new Error("Enter a price for every card");
        assertCents(l.manualCents);
        return l.manualCents;
      });
      const total = prices.reduce((a, b) => a + b, 0);
      if (total !== priceCents) {
        throw new Error(`Card prices add up to ${total} cents but the lot cost ${priceCents} cents`);
      }
      weights = prices.map((p) => Math.max(p, 0));
      break;
    }
    case "even": {
      weights = lines.map((l) => l.quantity);
      prices = allocate(priceCents, weights);
      break;
    }
  }

  const fees = allocate(feesCents, weights);
  const shipping = allocate(shippingCents, weights);
  return lines.map((_, i) => ({
    purchaseCents: prices[i],
    feesCents: fees[i],
    shippingCents: shipping[i],
    gradingCents: 0,
  }));
}
