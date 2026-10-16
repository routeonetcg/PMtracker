import { decimalToCents } from "@/lib/money";
import type { ConditionLike, PriceField, ProviderProduct } from "./types";

/**
 * TCGdex (https://tcgdex.dev) — free, open-source, no API key.
 * Cards: GET https://api.tcgdex.net/v2/{lang}/cards/{id}
 * Search: GET https://api.tcgdex.net/v2/{lang}/cards?name={text}
 * Prices live in card.pricing: TCGplayer (USD, per variant) and Cardmarket (EUR).
 * TCGplayer prices are generally absent for Japanese cards; Cardmarket may cover them.
 */

export const TCGDEX_BASE = "https://api.tcgdex.net/v2";

export const tcgdexLang = (language: "EN" | "JP") => (language === "JP" ? "ja" : "en");

/** External ids are stored as "en:swsh9-157" / "ja:S8b-223" so the language travels with the id. */
export function tcgdexExternalId(lang: "en" | "ja", cardId: string) {
  return `${lang}:${cardId}`;
}

export function parseTcgdexExternalId(externalId: string): { lang: "en" | "ja"; id: string } {
  const [lang, ...rest] = externalId.split(":");
  if ((lang === "en" || lang === "ja") && rest.length) return { lang, id: rest.join(":") };
  return { lang: "en", id: externalId };
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

const TCGPLAYER_VARIANTS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holofoil",
  "reverse-holofoil": "Reverse Holofoil",
  "1st-edition": "1st Edition",
  "1st-edition-holofoil": "1st Edition Holofoil",
  unlimited: "Unlimited",
  "unlimited-holofoil": "Unlimited Holofoil",
};

const TCGPLAYER_POINTS: [string, string][] = [
  ["marketPrice", "market"],
  ["lowPrice", "low"],
  ["midPrice", "mid"],
];

const CARDMARKET_POINTS: [string, string][] = [
  ["trend", "trend"],
  ["avg30", "30-day avg"],
  ["avg7", "7-day avg"],
  ["low", "low"],
];

/** Image URLs come without extension: append quality + format. */
export function tcgdexImage(base: string | null, quality: "low" | "high" = "high") {
  return base ? `${base}/${quality}.webp` : null;
}

export function parseTcgdexCard(json: unknown, lang: "en" | "ja"): ProviderProduct | null {
  if (!isObj(json) || !str(json.id) || !str(json.name)) return null;
  const set = isObj(json.set) ? json.set : {};
  const fields: PriceField[] = [];
  const pricing = isObj(json.pricing) ? json.pricing : {};

  const tcg = isObj(pricing.tcgplayer) ? pricing.tcgplayer : null;
  if (tcg) {
    for (const [variantKey, variant] of Object.entries(tcg)) {
      if (!isObj(variant)) continue; // skips "updated", "unit"
      const variantLabel = TCGPLAYER_VARIANTS[variantKey] ?? variantKey;
      for (const [point, pointLabel] of TCGPLAYER_POINTS) {
        if (!(point in variant)) continue;
        fields.push({
          key: `tcgplayer.${variantKey}.${pointLabel === "market" ? "market" : pointLabel}`,
          label: `TCGplayer · ${variantLabel} · ${pointLabel}`,
          currency: "USD",
          nativeCents: decimalToCents(variant[point] as number),
        });
      }
    }
  }

  const cm = isObj(pricing.cardmarket) ? pricing.cardmarket : null;
  if (cm) {
    for (const suffix of ["", "-holo"]) {
      for (const [point, pointLabel] of CARDMARKET_POINTS) {
        const k = `${point}${suffix}`;
        if (!(k in cm)) continue;
        fields.push({
          key: `cardmarket.${k}`,
          label: `Cardmarket${suffix ? " · Holo" : ""} · ${pointLabel} (EUR)`,
          currency: "EUR",
          nativeCents: decimalToCents(cm[k] as number),
        });
      }
    }
  }

  const id = String(json.id);
  return {
    provider: "tcgdex",
    externalId: tcgdexExternalId(lang, id),
    name: String(json.name),
    setName: str(set.name),
    number: str(json.localId),
    language: lang === "ja" ? "JP" : "EN",
    rarity: str(json.rarity),
    imageUrl: tcgdexImage(str(json.image)),
    url: `https://tcgdex.dev/cards/${encodeURIComponent(id)}`,
    fields,
  };
}

/** Search results are brief: { id, localId, name, image }. */
export function parseTcgdexSearch(json: unknown, lang: "en" | "ja"): ProviderProduct[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c): c is Json => isObj(c) && !!str(c.id) && !!str(c.name))
    .map((c) => ({
      provider: "tcgdex" as const,
      externalId: tcgdexExternalId(lang, String(c.id)),
      name: String(c.name),
      setName: null,
      number: str(c.localId),
      language: lang === "ja" ? ("JP" as const) : ("EN" as const),
      rarity: null,
      imageUrl: tcgdexImage(str(c.image), "low"),
      url: null,
      fields: [],
    }));
}

/**
 * Default field for a raw card: TCGplayer market price for the matching
 * printing (reverse holo / holo / normal), else Cardmarket trend.
 * TCGdex has no graded prices, so graded cards get null (use PriceCharting).
 */
export function suggestTcgdexField(p: ProviderProduct, c: ConditionLike): string | null {
  if (c.conditionType === "graded") return null;
  const priced = (k: string) => p.fields.some((f) => f.key === k && f.nativeCents !== null);
  const variants = c.variants ?? [];
  const order = [
    ...(variants.includes("reverse_holo") ? ["reverse-holofoil"] : []),
    ...(variants.includes("first_edition") ? ["1st-edition-holofoil", "1st-edition"] : []),
    "holofoil",
    "normal",
    "unlimited-holofoil",
    "unlimited",
    "reverse-holofoil",
  ];
  for (const v of order) if (priced(`tcgplayer.${v}.market`)) return `tcgplayer.${v}.market`;
  const holo = variants.includes("holo") || variants.includes("reverse_holo");
  for (const k of holo ? ["cardmarket.trend-holo", "cardmarket.trend", "cardmarket.avg30"] : ["cardmarket.trend", "cardmarket.avg30", "cardmarket.trend-holo"]) {
    if (priced(k)) return k;
  }
  return p.fields.find((f) => f.nativeCents !== null)?.key ?? null;
}
