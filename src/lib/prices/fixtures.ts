/**
 * OFFLINE SAMPLE RESPONSES — for local development when the price APIs can't
 * be reached (PRICE_FIXTURES=1). Shapes follow the providers' documented
 * formats; the PRICES ARE MADE UP and must never be treated as market data.
 * Prices drift a little by date so the history chart and alerts can be tested.
 */

type Json = Record<string, unknown>;

const tcgdexCards: Record<string, Json> = {
  "en:xy7-98": card("xy7-98", "98", "M Rayquaza EX", "Ancient Origins", "Ultra Rare", { holofoil: 742.5 }, { trend: 610, avg30: 625 }),
  "en:sv03-228": card("sv03-228", "228", "Charizard ex", "Obsidian Flames", "Hyper rare", { holofoil: 31.87 }, { trend: 26.4, avg30: 27.1 }),
  "en:xyp-XY133": card("xyp-XY133", "XY133", "Ash-Greninja EX", "XY Black Star Promos", "None", { holofoil: 24.06 }, { trend: 19.9, avg30: 21 }),
  "en:swsh9-157": card("swsh9-157", "157", "Pikachu V", "Brilliant Stars", "Rare Holo V", { holofoil: 17.42 }, { trend: 14.2, avg30: 15 }),
  "en:sm9-164": card("sm9-164", "164", "Gengar & Mimikyu GX", "Team Up", "Rare Ultra", { holofoil: 98.15 }, { trend: 81, avg30: 84.5 }),
  "en:sm10-199": card("sm10-199", "199", "Marshadow & Machamp GX", "Unbroken Bonds", "Rare Ultra", { holofoil: 61.3 }, { trend: 52, avg30: 53.4 }),
  "en:svp-052": card("svp-052", "052", "Mewtwo", "SV Black Star Promos", "None", { holofoil: 6.12 }, { trend: 4.9, avg30: 5.2 }),
  "ja:S8b-223": card("S8b-223", "223", "ピカチュウVMAX", "VMAXクライマックス", "CSR", null, { trend: 118, avg30: 121 }),
};

function card(
  id: string,
  localId: string,
  name: string,
  set: string,
  rarity: string,
  tcgplayer: Record<string, number> | null,
  cardmarket: { trend: number; avg30: number },
): Json {
  const [series, setId] = id.includes("-") ? [id.split("-")[0].replace(/\d.*$/, "") || "xy", id.split("-")[0]] : ["misc", id];
  return {
    id,
    localId,
    name,
    rarity,
    category: "Pokemon",
    image: `https://assets.tcgdex.net/en/${series}/${setId}/${localId}`,
    set: { id: setId, name: set },
    pricing: {
      ...(tcgplayer
        ? {
            tcgplayer: {
              updated: "2026-10-15T00:00:00Z",
              unit: "USD",
              ...Object.fromEntries(
                Object.entries(tcgplayer).map(([v, market]) => [
                  v,
                  { lowPrice: round(market * 0.82), midPrice: round(market * 1.05), highPrice: round(market * 1.9), marketPrice: market },
                ]),
              ),
            },
          }
        : {}),
      cardmarket: { updated: "2026-10-15T00:00:00Z", unit: "EUR", trend: cardmarket.trend, avg30: cardmarket.avg30, avg7: cardmarket.trend, low: round(cardmarket.trend * 0.8) },
    },
  };
}

const pcProducts: Record<string, Json> = {
  "pc-1001": pc("pc-1001", "M Rayquaza EX #98", "Pokemon Ancient Origins", 76000, 98000, 125000, 160000, 210000, 395000, 520000),
  "pc-1002": pc("pc-1002", "Charizard ex #228", "Pokemon Obsidian Flames", 3200, 3900, 4600, 6100, 7400, 13500, 21000),
  "pc-1003": pc("pc-1003", "Pikachu VMAX #223", "Pokemon Japanese VMAX Climax", 13900, 15500, 17800, 21500, 25500, 39800, 61000),
  "pc-1004": pc("pc-1004", "Chandelure #112", "Pokemon Japanese 30th Celebration", 2400, 2900, 3300, 4100, 4900, 8800, 12500),
};

function pc(id: string, name: string, consoleName: string, loose: number, g7: number, g8: number, g9: number, g95: number, psa10: number, bgs10: number): Json {
  return {
    status: "success",
    id,
    "product-name": name,
    "console-name": consoleName,
    "loose-price": loose,
    "cib-price": g7,
    "new-price": g8,
    "graded-price": g9,
    "box-only-price": g95,
    "manual-only-price": psa10,
    "bgs-10-price": bgs10,
    "condition-17-price": Math.round(psa10 * 0.8),
    "condition-18-price": Math.round(psa10 * 0.7),
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Deterministic daily drift (±~6%) so charts and alerts have something to show. */
function drift(key: string, asOf: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const day = Math.floor(Date.parse(`${asOf}T00:00:00Z`) / 86_400_000);
  return 1 + 0.06 * Math.sin((day + (h % 50)) / 5) + (h % 7 === 0 ? (day % 30) * 0.004 : 0);
}

function scaleTcgdex(json: Json, f: number): Json {
  return JSON.parse(JSON.stringify(json), (k, v) =>
    typeof v === "number" && ["marketPrice", "lowPrice", "midPrice", "highPrice", "trend", "avg30", "avg7", "low"].includes(k) ? round(v * f) : v,
  );
}

function scalePc(json: Json, f: number): Json {
  return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === "number" && k.endsWith("-price") ? Math.round(v * f) : v]));
}

/** Resolve a provider URL to a sample response, or undefined if unknown. */
export function fixtureResponse(url: string, asOf: string): unknown {
  const u = new URL(url);
  if (u.hostname === "api.tcgdex.net") {
    const m = /^\/v2\/(en|ja)\/cards(?:\/(.+))?$/.exec(u.pathname);
    if (!m) return undefined;
    const lang = m[1];
    if (m[2]) {
      const key = `${lang}:${decodeURIComponent(m[2])}`;
      const c = tcgdexCards[key];
      return c ? scaleTcgdex(c, drift(key, asOf)) : undefined;
    }
    const q = (u.searchParams.get("name") ?? "").toLowerCase();
    return Object.entries(tcgdexCards)
      .filter(([k, c]) => k.startsWith(`${lang}:`) && String(c.name).toLowerCase().includes(q))
      .map(([, c]) => ({ id: c.id, localId: c.localId, name: c.name, image: c.image }));
  }
  if (u.hostname === "www.pricecharting.com") {
    if (u.pathname === "/api/product") {
      const id = u.searchParams.get("id") ?? "";
      const p = pcProducts[id];
      return p ? scalePc(p, drift(id, asOf)) : { status: "error", "error-message": "No such product" };
    }
    if (u.pathname === "/api/products") {
      const words = (u.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return {
        status: "success",
        products: Object.values(pcProducts).filter((p) =>
          words.every((w) => `${p["product-name"]} ${p["console-name"]}`.toLowerCase().includes(w)),
        ),
      };
    }
  }
  if (u.hostname === "www.ecb.europa.eu") {
    return `<?xml version="1.0"?><gesmes:Envelope><Cube><Cube time="${asOf}"><Cube currency="USD" rate="1.0815"/></Cube></Cube></gesmes:Envelope>`;
  }
  return undefined;
}
