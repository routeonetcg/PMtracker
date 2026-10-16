import "server-only";
import { decimalToPpm } from "@/lib/money";
import { fixtureResponse } from "@/lib/prices/fixtures";
import { parsePriceChartingProduct, parsePriceChartingSearch, PRICECHARTING_BASE, suggestPriceChartingField } from "@/lib/prices/pricecharting";
import { parseTcgdexCard, parseTcgdexExternalId, parseTcgdexSearch, suggestTcgdexField, TCGDEX_BASE, tcgdexLang } from "@/lib/prices/tcgdex";
import { type PriceProvider, ProviderError, type ProviderId } from "@/lib/prices/types";
import { todayISO } from "@/lib/dates";

/** PRICE_FIXTURES=1 serves offline sample responses (made-up prices) instead of calling the APIs. */
export const usingFixtures = () => process.env.PRICE_FIXTURES === "1";

const UA = "RouteOneTCG-HQ/1.0 (private inventory tool)";

async function fetchRaw(url: string, opts: { asOf?: string; timeoutMs?: number } = {}): Promise<{ status: number; body: string }> {
  if (usingFixtures()) {
    const res = fixtureResponse(url, opts.asOf ?? todayISO());
    if (res === undefined) return { status: 404, body: "" };
    return { status: 200, body: typeof res === "string" ? res : JSON.stringify(res) };
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new ProviderError(`HTTP ${res.status}`, res.status);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      return { status: res.status, body: await res.text() };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError("Request failed");
}

async function fetchJson(url: string, opts: { asOf?: string } = {}): Promise<unknown> {
  const { status, body } = await fetchRaw(url, opts);
  if (status === 404) return null;
  if (status === 401 || status === 403) throw new ProviderError("The provider rejected the API key", status);
  if (status >= 400) throw new ProviderError(`HTTP ${status}`, status);
  try {
    return JSON.parse(body);
  } catch {
    throw new ProviderError("The provider returned something that isn't JSON");
  }
}

const tcgdex: PriceProvider = {
  id: "tcgdex",
  name: "TCGdex (TCGplayer + Cardmarket)",
  async search(query, { language }) {
    const lang = tcgdexLang(language);
    const q = query.trim();
    if (q.length < 2) return [];
    const json = await fetchJson(`${TCGDEX_BASE}/${lang}/cards?name=${encodeURIComponent(q)}`);
    return parseTcgdexSearch(json, lang).slice(0, 40);
  },
  async fetch(externalId, opts) {
    const { lang, id } = parseTcgdexExternalId(externalId);
    const json = await fetchJson(`${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(id)}`, opts);
    const p = parseTcgdexCard(json, lang);
    // Offline samples can't load images from the CDN.
    if (p && usingFixtures()) p.imageUrl = null;
    return p;
  },
  suggestField: suggestTcgdexField,
};

function pcToken() {
  return process.env.PRICECHARTING_TOKEN?.trim() || (usingFixtures() ? "sample" : "");
}

const pricecharting: PriceProvider = {
  id: "pricecharting",
  name: "PriceCharting (graded, Japanese, sealed)",
  async search(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const json = await fetchJson(`${PRICECHARTING_BASE}/products?t=${encodeURIComponent(pcToken())}&q=${encodeURIComponent(`pokemon ${q}`)}`);
    return parsePriceChartingSearch(json).slice(0, 40);
  },
  async fetch(externalId, opts) {
    const json = await fetchJson(`${PRICECHARTING_BASE}/product?t=${encodeURIComponent(pcToken())}&id=${encodeURIComponent(externalId)}`, opts);
    return parsePriceChartingProduct(json);
  },
  suggestField: suggestPriceChartingField,
};

export function enabledProviders(): PriceProvider[] {
  return [tcgdex, ...(pcToken() ? [pricecharting] : [])];
}

export function getProvider(id: ProviderId): PriceProvider {
  const p = enabledProviders().find((x) => x.id === id);
  if (!p) throw new ProviderError(id === "pricecharting" ? "PriceCharting isn't set up. Add PRICECHARTING_TOKEN (see README)." : `Unknown provider ${id}`);
  return p;
}

export function providerStatus() {
  return [
    { id: "tcgdex" as const, name: tcgdex.name, enabled: true, cost: "Free" },
    { id: "pricecharting" as const, name: pricecharting.name, enabled: !!pcToken(), cost: "Paid (Legendary plan)" },
  ];
}

/** Today's EUR→USD reference rate from the European Central Bank (free, no key). */
export async function fetchEurUsdPpm(asOf?: string): Promise<number | null> {
  try {
    const { status, body } = await fetchRaw("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { asOf, timeoutMs: 10_000 });
    if (status !== 200) return null;
    const m = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(body);
    return m ? decimalToPpm(m[1]) : null;
  } catch {
    return null;
  }
}
