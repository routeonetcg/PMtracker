import { allocate } from "./allocate";
import { assertCents, type Cents } from "./cents";

export type TradeOutLine = { agreedValueCents: Cents; costBasisCents: Cents };
export type TradeInLine = { agreedValueCents: Cents };

export type TradeInput = {
  out: TradeOutLine[];
  in: TradeInLine[];
  /** Cash we received from the other side. */
  cashInCents: Cents;
  /** Cash we paid to the other side. */
  cashOutCents: Cents;
};

export type TradeResult = {
  /** Realized profit per outgoing card: agreed value − cost basis. */
  outProfitCents: Cents[];
  /** Cost basis assigned to each incoming card. */
  inCostCents: Cents[];
  realizedProfitCents: Cents;
  outValueCents: Cents;
  inValueCents: Cents;
  /** (in value + cash in) − (out value + cash out). 0 = the trade balances. */
  imbalanceCents: Cents;
};

/**
 * Trades: several cards out, several in, optional cash either way.
 * - Outgoing cards realize profit = agreed value − cost basis.
 * - Incoming cards together cost what we gave up: out value + cash paid − cash
 *   received, split across them by their agreed values. When the trade balances,
 *   each incoming card's cost is exactly its agreed value, and no profit appears
 *   out of thin air when the agreed values don't line up.
 * - If we received more cash than we gave in value, incoming cards cost 0 and
 *   the extra cash is already counted through the outgoing cards' value.
 */
export function computeTrade(input: TradeInput): TradeResult {
  const { cashInCents, cashOutCents } = input;
  assertCents(cashInCents);
  assertCents(cashOutCents);
  if (cashInCents < 0 || cashOutCents < 0) throw new Error("Cash amounts cannot be negative");
  if (input.out.length === 0 && input.in.length === 0) throw new Error("A trade needs at least one card");
  for (const l of [...input.out, ...input.in]) {
    assertCents(l.agreedValueCents);
    if (l.agreedValueCents < 0) throw new Error("Trade values cannot be negative");
  }

  const outValueCents = input.out.reduce((a, l) => a + l.agreedValueCents, 0);
  const inValueCents = input.in.reduce((a, l) => a + l.agreedValueCents, 0);
  const outProfitCents = input.out.map((l) => l.agreedValueCents - l.costBasisCents);
  const realizedProfitCents = outProfitCents.reduce((a, b) => a + b, 0);

  const givenUp = Math.max(outValueCents + cashOutCents - cashInCents, 0);
  const inCostCents =
    input.in.length === 0 ? [] : allocate(givenUp, input.in.map((l) => l.agreedValueCents));

  return {
    outProfitCents,
    inCostCents,
    realizedProfitCents,
    outValueCents,
    inValueCents,
    imbalanceCents: inValueCents + cashInCents - (outValueCents + cashOutCents),
  };
}
