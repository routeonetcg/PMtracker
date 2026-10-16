import { allocate } from "./allocate";
import { assertCents, type Cents } from "./cents";

/**
 * Grading cost added to each card's basis when a submission comes back:
 * the per-card fee plus an even share of submission-level costs (shipping,
 * insurance, upcharges).
 */
export function gradingCostPerCard(
  cardCount: number,
  costPerCardCents: Cents,
  submissionExtrasCents: Cents,
  upchargesCents: Cents[] = [],
): Cents[] {
  if (!Number.isInteger(cardCount) || cardCount < 1) throw new Error("A submission needs at least one card");
  assertCents(costPerCardCents);
  assertCents(submissionExtrasCents);
  const extras = allocate(submissionExtrasCents, Array.from({ length: cardCount }, () => 1));
  return extras.map((e, i) => costPerCardCents + e + (upchargesCents[i] ?? 0));
}
