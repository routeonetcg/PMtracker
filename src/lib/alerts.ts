import { addDays, type ISODate } from "@/lib/dates";
import { changeBps, formatBps, formatUSD } from "@/lib/money";

export type AlertRule = {
  /** null = the shop-wide default ±X% rule from settings. */
  id: string | null;
  kind: "move_pct" | "above" | "below";
  thresholdBps: number | null;
  windowDays: number;
  targetCents: number | null;
};

export type HistoryPoint = { onDate: ISODate; priceCents: number };

export type PastEvent = { alertId: string | null; kind: AlertRule["kind"]; onDate: ISODate; acknowledged: boolean };

export type FiredAlert = {
  alertId: string | null;
  kind: AlertRule["kind"];
  fromCents: number | null;
  toCents: number;
  changeBps: number | null;
  message: string;
};

/** Latest price on or before `date`. History must be sorted by date ascending. */
export function priceOnOrBefore(history: HistoryPoint[], date: ISODate): HistoryPoint | null {
  let found: HistoryPoint | null = null;
  for (const h of history) {
    if (h.onDate <= date) found = h;
    else break;
  }
  return found;
}

/**
 * Decide which alerts fire today for one card.
 * - move_pct: |change vs the price `windowDays` ago| ≥ threshold. Fires at most
 *   once per window so a big move doesn't alert every day.
 * - above / below: fires when the price crosses the target (or first lands past
 *   it), and not again while an earlier alert for that rule is still open.
 */
export function evaluateAlerts(input: {
  cardName: string;
  today: ISODate;
  history: HistoryPoint[];
  rules: AlertRule[];
  pastEvents: PastEvent[];
}): FiredAlert[] {
  const { today, rules, pastEvents, cardName } = input;
  const history = [...input.history].sort((a, b) => a.onDate.localeCompare(b.onDate));
  const current = priceOnOrBefore(history, today);
  if (!current || current.onDate !== today) return [];
  const fired: FiredAlert[] = [];

  for (const r of rules) {
    const mine = pastEvents.filter((e) => e.alertId === r.id && e.kind === r.kind);
    if (r.kind === "move_pct") {
      if (!r.thresholdBps || r.thresholdBps <= 0) continue;
      const base = priceOnOrBefore(history, addDays(today, -r.windowDays));
      if (!base || base.priceCents === 0) continue;
      const change = changeBps(base.priceCents, current.priceCents);
      if (change === null || Math.abs(change) < r.thresholdBps) continue;
      const since = addDays(today, -r.windowDays);
      if (mine.some((e) => e.onDate > since)) continue;
      fired.push({
        alertId: r.id,
        kind: r.kind,
        fromCents: base.priceCents,
        toCents: current.priceCents,
        changeBps: change,
        message: `${cardName} ${change > 0 ? "up" : "down"} ${formatBps(Math.abs(change))} in ${r.windowDays} days (${formatUSD(base.priceCents)} → ${formatUSD(current.priceCents)})`,
      });
    } else {
      if (!r.targetCents) continue;
      const past = (p: number) => (r.kind === "above" ? p >= r.targetCents! : p <= r.targetCents!);
      if (!past(current.priceCents)) continue;
      const prev = priceOnOrBefore(history, addDays(today, -1));
      // Once told, only alert again on a real new crossing (it went back past the target and returned).
      if (mine.length > 0 && (!prev || past(prev.priceCents))) continue;
      if (mine.some((e) => !e.acknowledged)) continue;
      fired.push({
        alertId: r.id,
        kind: r.kind,
        fromCents: prev?.priceCents ?? null,
        toCents: current.priceCents,
        changeBps: prev ? changeBps(prev.priceCents, current.priceCents) : null,
        message: `${cardName} is ${r.kind === "above" ? "at or above" : "at or below"} your ${formatUSD(r.targetCents)} target (now ${formatUSD(current.priceCents)})`,
      });
    }
  }
  return fired;
}
