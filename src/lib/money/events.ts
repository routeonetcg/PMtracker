import type { Cents } from "./cents";

export type CashMovement = {
  method: "cash" | "digital";
  /** Positive = money in (sale, trade cash received). Negative = money out. */
  amountCents: Cents;
};

export type CashReconciliation = {
  floatCents: Cents;
  cashInCents: Cents;
  cashOutCents: Cents;
  digitalInCents: Cents;
  digitalOutCents: Cents;
  expectedCashCents: Cents;
  countedCashCents: Cents | null;
  /** counted − expected: positive = over, negative = short. */
  differenceCents: Cents | null;
};

/** Expected cash in the box = float + cash taken − cash paid out. */
export function reconcileCash(
  floatCents: Cents,
  movements: CashMovement[],
  countedCashCents: Cents | null = null,
): CashReconciliation {
  let cashIn = 0;
  let cashOut = 0;
  let digitalIn = 0;
  let digitalOut = 0;
  for (const m of movements) {
    if (m.method === "cash") {
      if (m.amountCents >= 0) cashIn += m.amountCents;
      else cashOut += -m.amountCents;
    } else if (m.amountCents >= 0) digitalIn += m.amountCents;
    else digitalOut += -m.amountCents;
  }
  const expected = floatCents + cashIn - cashOut;
  return {
    floatCents,
    cashInCents: cashIn,
    cashOutCents: cashOut,
    digitalInCents: digitalIn,
    digitalOutCents: digitalOut,
    expectedCashCents: expected,
    countedCashCents,
    differenceCents: countedCashCents === null ? null : countedCashCents - expected,
  };
}
