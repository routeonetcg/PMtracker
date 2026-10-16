import { applyBps, type Bps, BPS_100, type Cents, mulDivRound } from "./cents";

export type AskingMode = "manual" | "markup";

/**
 * Asking price = market × (1 + markup). Optionally round UP to a step
 * (e.g. 100 = next whole dollar, 500 = next $5) since nobody asks $41.37.
 */
export function askingFromMarkup(marketCents: Cents, markupBps: Bps, roundUpToCents = 0): Cents {
  const raw = applyBps(marketCents, BPS_100 + markupBps);
  if (roundUpToCents <= 0 || raw <= 0) return raw;
  return Math.ceil(raw / roundUpToCents) * roundUpToCents;
}

export type AskingInput = {
  askingMode: AskingMode;
  askingCents: Cents | null;
  markupBps: Bps | null;
  marketCents: Cents | null;
  roundUpToCents?: number;
};

/** The effective asking price for a row, or null if it can't be computed. */
export function effectiveAsking(i: AskingInput): Cents | null {
  if (i.askingMode === "manual") return i.askingCents;
  if (i.marketCents === null || i.markupBps === null) return null;
  return askingFromMarkup(i.marketCents, i.markupBps, i.roundUpToCents ?? 0);
}

/** Unrealized P/L = market value of the copies − their cost basis. */
export function unrealized(marketUnitCents: Cents | null, quantity: number, costBasisCents: Cents): Cents | null {
  if (marketUnitCents === null) return null;
  return marketUnitCents * quantity - costBasisCents;
}

/** Percentage change between two prices in basis points (null if `from` is 0). */
export function changeBps(fromCents: Cents, toCents: Cents): Bps | null {
  if (fromCents === 0) return null;
  return mulDivRound(toCents - fromCents, BPS_100, fromCents);
}
