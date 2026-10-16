/**
 * Money is always an integer number of cents. Percentages are integer basis
 * points (10000 = 100%). Nothing in this module uses floating-point math on
 * money: multiplication/division goes through BigInt with explicit rounding.
 */

export type Cents = number;
export type Bps = number;

export const BPS_100 = 10_000;

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of cents (got ${value})`);
  }
}

/** Round half away from zero: a * b / d with integer inputs. */
export function mulDivRound(a: number, b: number, d: number): number {
  assertCents(a, "a");
  assertCents(b, "b");
  assertCents(d, "d");
  if (d === 0) throw new Error("Division by zero");
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(d);
  const negative = num < BigInt(0) !== den < BigInt(0);
  const absNum = num < BigInt(0) ? -num : num;
  const absDen = den < BigInt(0) ? -den : den;
  const q = absNum / absDen;
  const r = absNum % absDen;
  const rounded = r * BigInt(2) >= absDen ? q + BigInt(1) : q;
  return Number(negative ? -rounded : rounded);
}

/** cents × bps / 10000, rounded half away from zero. */
export function applyBps(cents: Cents, bps: Bps): Cents {
  return mulDivRound(cents, bps, BPS_100);
}

export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "total");
  return total;
}

/**
 * Parse user input like "1,234.5", "$35", "-12.07" into cents without floats.
 * Returns null for empty / invalid input or more than 2 decimals.
 */
export function parseDollars(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/[$,\s]/g, "");
  if (raw === "") return null;
  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  if (whole === "" && frac === "") return null;
  const cents = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return sign ? -cents : cents;
}

/** Parse "12.5" (percent) into basis points (1250) without floats. */
export function parsePercentToBps(input: string | number | null | undefined): Bps | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/[%\s]/g, "");
  if (raw === "") return null;
  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  if (whole === "" && frac === "") return null;
  const bps = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  return sign ? -bps : bps;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format cents as USD. Division by 100 here is display-only. */
export function formatUSD(cents: Cents | null | undefined, opts?: { whole?: boolean; signed?: boolean }): string {
  if (cents === null || cents === undefined) return "—";
  const fmt = opts?.whole && cents % 100 === 0 ? usdWhole : usd;
  const text = fmt.format(Math.abs(cents) / 100);
  if (cents < 0) return `-${text}`;
  if (opts?.signed && cents > 0) return `+${text}`;
  return text;
}

/** Cents → "12.34" for form inputs. */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatBps(bps: Bps | null | undefined, digits = 1): string {
  if (bps === null || bps === undefined) return "—";
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0").slice(0, digits);
  return digits > 0 ? `${sign}${whole}.${frac}%` : `${sign}${whole}%`;
}

/** part / whole as basis points (rounded). Returns null when whole is 0. */
export function ratioBps(part: number, whole: number): Bps | null {
  if (whole === 0) return null;
  return mulDivRound(part, BPS_100, whole);
}

/** Basis points → "13.25" for form inputs (no floats). */
export function bpsToInput(bps: Bps | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  const frac = abs % 100;
  return `${sign}${Math.floor(abs / 100)}${frac ? `.${String(frac).padStart(2, "0").replace(/0$/, "")}` : ""}`;
}
