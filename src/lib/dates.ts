/**
 * Business dates are plain calendar dates ("2026-11-14") in the shop's
 * timezone (APP_TIMEZONE, default America/New_York).
 */

export const TZ = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/New_York";

export type ISODate = string;

/** Today's date in the business timezone, as YYYY-MM-DD. */
export function todayISO(now = new Date(), tz = TZ): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(d: ISODate) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parts(d);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86_400_000);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function startOfYear(d: ISODate): ISODate {
  return `${d.slice(0, 4)}-01-01`;
}

/** Every YYYY-MM from a to b inclusive. */
export function monthsBetween(a: ISODate, b: ISODate): string[] {
  const out: string[] = [];
  let { y, m } = parts(a);
  const end = parts(b);
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
export function formatMonth(key: string): string {
  return monthFmt.format(new Date(`${key}-01T00:00:00Z`));
}

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  return dayFmt.format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
}

const dtFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dtFmt.format(typeof d === "string" ? new Date(d) : d);
}

export type PeriodKey = "month" | "30d" | "ytd" | "all" | "custom";

export const PERIODS: Record<PeriodKey, string> = {
  month: "This month",
  "30d": "Last 30 days",
  ytd: "Year to date",
  all: "All time",
  custom: "Custom",
};

export type Period = { key: PeriodKey; from: ISODate | null; to: ISODate; label: string };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriod(
  key: string | undefined,
  from?: string,
  to?: string,
  today: ISODate = todayISO(),
): Period {
  switch (key) {
    case "30d":
      return { key: "30d", from: addDays(today, -29), to: today, label: PERIODS["30d"] };
    case "ytd":
      return { key: "ytd", from: startOfYear(today), to: today, label: PERIODS.ytd };
    case "all":
      return { key: "all", from: null, to: today, label: PERIODS.all };
    case "custom": {
      const f = from && ISO_RE.test(from) ? from : startOfMonth(today);
      const t = to && ISO_RE.test(to) ? to : today;
      const [a, b] = f <= t ? [f, t] : [t, f];
      return { key: "custom", from: a, to: b, label: `${formatDate(a)} – ${formatDate(b)}` };
    }
    default:
      return { key: "month", from: startOfMonth(today), to: today, label: PERIODS.month };
  }
}

export function inPeriod(d: ISODate, p: Pick<Period, "from" | "to">): boolean {
  return (p.from === null || d >= p.from) && d <= p.to;
}
