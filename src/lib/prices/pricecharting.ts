import type { ConditionLike, PriceField, ProviderProduct } from "./types";

/**
 * PriceCharting (https://www.pricecharting.com/api-documentation) — PAID:
 * API access requires a Legendary subscription and a 40-character token.
 * GET https://www.pricecharting.com/api/product?t={token}&id={id}
 * GET https://www.pricecharting.com/api/products?t={token}&q={text}
 * Prices are integers in pennies. Current prices only (we keep history ourselves).
 *
 * For trading cards the generic slots mean (per PriceCharting's docs):
 * manual-only-price = PSA 10 and bgs-10-price = BGS 10 are documented.
 * The other grade mappings below (loose = ungraded, cib = 7, new = 8,
 * graded = 9, box-only = 9.5, condition-17 = CGC 10, condition-18 = SGC 10)
 * are the commonly used mapping but NOT yet verified against a live response.
 * Check them when the token is added (see README → Price sources).
 */

export const PRICECHARTING_BASE = "https://www.pricecharting.com/api";

export const PC_FIELDS: { key: string; label: string; grader?: string; grade?: number }[] = [
  { key: "loose-price", label: "Ungraded" },
  { key: "cib-price", label: "Grade 7", grade: 7 },
  { key: "new-price", label: "Grade 8", grade: 8 },
  { key: "graded-price", label: "Grade 9", grade: 9 },
  { key: "box-only-price", label: "Grade 9.5", grade: 9.5 },
  { key: "manual-only-price", label: "PSA 10", grader: "PSA", grade: 10 },
  { key: "bgs-10-price", label: "BGS 10", grader: "BGS", grade: 10 },
  { key: "condition-17-price", label: "CGC 10", grader: "CGC", grade: 10 },
  { key: "condition-18-price", label: "SGC 10", grader: "SGC", grade: 10 },
];

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function pennies(v: unknown): number | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return v;
  if (typeof v === "string" && /^\d+$/.test(v) && Number(v) > 0) return Number(v);
  return null;
}

export function parsePriceChartingProduct(json: unknown): ProviderProduct | null {
  if (!isObj(json) || json.status === "error") return null;
  const id = json.id ?? json["product-id"];
  const name = json["product-name"];
  if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string") return null;
  const consoleName = typeof json["console-name"] === "string" ? (json["console-name"] as string) : null;
  const fields: PriceField[] = PC_FIELDS.filter((f) => f.key in json).map((f) => ({
    key: f.key,
    label: `PriceCharting · ${f.label}`,
    currency: "USD",
    nativeCents: pennies(json[f.key]),
  }));
  // "#228" at the end of the product name is the card number.
  const num = /#\s*([A-Za-z0-9/-]+)\s*$/.exec(name)?.[1] ?? null;
  const setName = consoleName?.replace(/^Pokemon\s+/i, "") ?? null;
  return {
    provider: "pricecharting",
    externalId: String(id),
    name: name.replace(/\s*#\s*[A-Za-z0-9/-]+\s*$/, ""),
    setName,
    number: num,
    language: /japanese/i.test(consoleName ?? "") ? "JP" : "EN",
    rarity: null,
    imageUrl: null,
    url: `https://www.pricecharting.com/game/${String(id)}`,
    fields,
  };
}

export function parsePriceChartingSearch(json: unknown): ProviderProduct[] {
  if (!isObj(json) || !Array.isArray(json.products)) return [];
  return json.products.map(parsePriceChartingProduct).filter((p): p is ProviderProduct => p !== null);
}

/** Map the card's condition to PriceCharting's price slot. */
export function suggestPriceChartingField(p: ProviderProduct, c: ConditionLike): string | null {
  const has = (k: string) => p.fields.some((f) => f.key === k);
  if (c.conditionType === "raw") return has("loose-price") ? "loose-price" : null;
  const grade = Number(c.grade);
  if (grade === 10) {
    const byGrader = PC_FIELDS.find((f) => f.grade === 10 && f.grader === c.grader);
    if (byGrader && has(byGrader.key)) return byGrader.key;
    return has("manual-only-price") ? "manual-only-price" : null; // TAG 10 etc.: closest is PSA 10
  }
  const generic = PC_FIELDS.find((f) => !f.grader && f.grade === grade);
  if (generic && has(generic.key)) return generic.key;
  // Grades below 7 or odd half grades: fall back to the nearest lower slot.
  const lower = PC_FIELDS.filter((f) => !f.grader && f.grade !== undefined && f.grade <= grade).pop();
  return lower && has(lower.key) ? lower.key : has("loose-price") ? "loose-price" : null;
}
