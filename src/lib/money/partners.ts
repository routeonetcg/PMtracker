import { allocate, allocateByBps } from "./allocate";
import { type Bps, BPS_100, type Cents } from "./cents";

export type PartnerShare = { partnerId: string; splitBps: Bps };

export type PartnerLedger = {
  partnerId: string;
  contributedCents: Cents;
  drawnCents: Cents;
};

export type PartnerBalance = {
  partnerId: string;
  contributedCents: Cents;
  drawnCents: Cents;
  profitShareCents: Cents;
  /** What the business owes this partner: in − out + share of net profit. */
  claimCents: Cents;
};

/** Split net profit by each partner's split % (must add to 100%). */
export function splitProfit(netProfitCents: Cents, partners: PartnerShare[]): Cents[] {
  const total = partners.reduce((a, p) => a + p.splitBps, 0);
  if (total !== BPS_100) throw new Error("Profit split must add up to 100%");
  return allocateByBps(netProfitCents, partners.map((p) => p.splitBps));
}

export function partnerBalances(
  netProfitCents: Cents,
  partners: PartnerShare[],
  ledgers: PartnerLedger[],
): PartnerBalance[] {
  const shares = splitProfit(netProfitCents, partners);
  return partners.map((p, i) => {
    const l = ledgers.find((x) => x.partnerId === p.partnerId) ?? {
      partnerId: p.partnerId,
      contributedCents: 0,
      drawnCents: 0,
    };
    return {
      partnerId: p.partnerId,
      contributedCents: l.contributedCents,
      drawnCents: l.drawnCents,
      profitShareCents: shares[i],
      claimCents: l.contributedCents - l.drawnCents + shares[i],
    };
  });
}

export type HolderFlow =
  | { kind: "contribution"; holderId: string; amountCents: Cents }
  | { kind: "draw"; holderId: string; amountCents: Cents }
  | { kind: "transfer"; fromHolderId: string; toHolderId: string; amountCents: Cents }
  | { kind: "sale"; holderId: string; netProceedsCents: Cents }
  | { kind: "purchase"; holderId: string; amountCents: Cents }
  | { kind: "expense"; holderId: string; amountCents: Cents }
  | { kind: "trade_cash"; holderId: string; cashInCents: Cents; cashOutCents: Cents };

/** Cash each holder (partner or business account) currently has, from the flows. */
export function cashByHolder(holderIds: string[], flows: HolderFlow[]): Map<string, Cents> {
  const cash = new Map<string, Cents>(holderIds.map((id) => [id, 0]));
  const add = (id: string, delta: Cents) => cash.set(id, (cash.get(id) ?? 0) + delta);
  for (const f of flows) {
    switch (f.kind) {
      case "contribution":
        add(f.holderId, f.amountCents);
        break;
      case "draw":
        add(f.holderId, -f.amountCents);
        break;
      case "transfer":
        add(f.fromHolderId, -f.amountCents);
        add(f.toHolderId, f.amountCents);
        break;
      case "sale":
        add(f.holderId, f.netProceedsCents);
        break;
      case "purchase":
      case "expense":
        add(f.holderId, -f.amountCents);
        break;
      case "trade_cash":
        add(f.holderId, f.cashInCents - f.cashOutCents);
        break;
    }
  }
  return cash;
}

export type SettleInput = {
  partners: (PartnerShare & { claimCents: Cents; holderId: string })[];
  /** Cash + inventory at cost held by each holder. */
  holdingsByHolder: Map<string, Cents>;
  businessHolderId: string;
};

export type SettleRow = {
  partnerId: string;
  claimCents: Cents;
  personalHoldingCents: Cents;
  businessShareCents: Cents;
  /** Positive = this partner holds more than their share and should pay that much out. */
  excessCents: Cents;
};

/**
 * Settle-up: the business account stays put and is shared by split %. Each
 * partner should personally hold (claim − their share of the business account).
 * Anything above that they owe the other partner(s); excesses sum to zero when
 * the books are complete.
 */
export function settleUp(input: SettleInput): SettleRow[] {
  const business = input.holdingsByHolder.get(input.businessHolderId) ?? 0;
  const bizShares = splitProfit(business, input.partners);
  return input.partners.map((p, i) => {
    const personal = input.holdingsByHolder.get(p.holderId) ?? 0;
    const target = p.claimCents - bizShares[i];
    return {
      partnerId: p.partnerId,
      claimCents: p.claimCents,
      personalHoldingCents: personal,
      businessShareCents: bizShares[i],
      excessCents: personal - target,
    };
  });
}

/** Even fallback when there is no split configured. */
export function evenSplit(total: Cents, n: number): Cents[] {
  return allocate(total, Array.from({ length: n }, () => 1));
}
