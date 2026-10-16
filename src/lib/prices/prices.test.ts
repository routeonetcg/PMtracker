import { describe, expect, it } from "vitest";
import { evaluateAlerts, type HistoryPoint } from "@/lib/alerts";
import { decimalToCents, decimalToPpm, eurToUsdCents } from "@/lib/money";
import { fixtureResponse } from "./fixtures";
import { parsePriceChartingProduct, parsePriceChartingSearch, suggestPriceChartingField } from "./pricecharting";
import { parseTcgdexCard, parseTcgdexExternalId, parseTcgdexSearch, suggestTcgdexField } from "./tcgdex";

describe("decimal conversions", () => {
  it("turns provider decimals into cents without float errors", () => {
    expect(decimalToCents(31.87)).toBe(3187);
    expect(decimalToCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004
    expect(decimalToCents("12.345")).toBe(1235);
    expect(decimalToCents("12.344")).toBe(1234);
    expect(decimalToCents(1e21)).toBeNull();
    expect(decimalToCents(5)).toBe(500);
    expect(decimalToCents(null)).toBeNull();
    expect(decimalToCents("abc")).toBeNull();
  });

  it("converts EUR to USD with an integer rate", () => {
    expect(decimalToPpm("1.0815")).toBe(1081500);
    expect(eurToUsdCents(10000, 1081500)).toBe(10815);
    expect(eurToUsdCents(1, 1081500)).toBe(1);
  });
});

describe("TCGdex parsing", () => {
  const raw = {
    id: "swsh9-157",
    localId: "157",
    name: "Pikachu V",
    rarity: "Rare Holo V",
    image: "https://assets.tcgdex.net/en/swsh/swsh9/157",
    set: { id: "swsh9", name: "Brilliant Stars" },
    pricing: {
      tcgplayer: {
        updated: "2026-10-15T00:00:00Z",
        unit: "USD",
        holofoil: { lowPrice: 14.5, midPrice: 18.2, highPrice: 33, marketPrice: 17.42 },
        "reverse-holofoil": { lowPrice: 3, marketPrice: 4.1 },
      },
      cardmarket: { updated: "2026-10-15", unit: "EUR", trend: 14.2, avg30: 15, "trend-holo": 16.1 },
    },
  };

  it("parses prices per variant and market", () => {
    const p = parseTcgdexCard(raw, "en")!;
    expect(p.externalId).toBe("en:swsh9-157");
    expect(p.setName).toBe("Brilliant Stars");
    expect(p.imageUrl).toBe("https://assets.tcgdex.net/en/swsh/swsh9/157/high.webp");
    const byKey = Object.fromEntries(p.fields.map((f) => [f.key, f]));
    expect(byKey["tcgplayer.holofoil.market"].nativeCents).toBe(1742);
    expect(byKey["tcgplayer.reverse-holofoil.market"].nativeCents).toBe(410);
    expect(byKey["cardmarket.trend"]).toMatchObject({ currency: "EUR", nativeCents: 1420 });
    expect(byKey["cardmarket.trend-holo"].nativeCents).toBe(1610);
  });

  it("picks a sensible default price field", () => {
    const p = parseTcgdexCard(raw, "en")!;
    expect(suggestTcgdexField(p, { conditionType: "raw", grader: null, grade: null })).toBe("tcgplayer.holofoil.market");
    expect(suggestTcgdexField(p, { conditionType: "raw", grader: null, grade: null, variants: ["reverse_holo"] })).toBe("tcgplayer.reverse-holofoil.market");
    expect(suggestTcgdexField(p, { conditionType: "graded", grader: "PSA", grade: "10" })).toBeNull();
  });

  it("falls back to Cardmarket for Japanese cards without TCGplayer prices", () => {
    const p = parseTcgdexCard({ ...raw, pricing: { cardmarket: { trend: 118, avg30: 121 } } }, "ja")!;
    expect(p.language).toBe("JP");
    expect(suggestTcgdexField(p, { conditionType: "raw", grader: null, grade: null })).toBe("cardmarket.trend");
  });

  it("handles missing pricing, bad input and ids", () => {
    expect(parseTcgdexCard({ id: "x", name: "y" }, "en")!.fields).toEqual([]);
    expect(parseTcgdexCard(null, "en")).toBeNull();
    expect(parseTcgdexSearch([{ id: "a-1", name: "A", localId: "1" }, { nope: 1 }], "en")).toHaveLength(1);
    expect(parseTcgdexExternalId("ja:S8b-223")).toEqual({ lang: "ja", id: "S8b-223" });
  });
});

describe("PriceCharting parsing", () => {
  const raw = {
    status: "success",
    id: "123",
    "product-name": "Charizard ex #228",
    "console-name": "Pokemon Obsidian Flames",
    "loose-price": 3200,
    "graded-price": 6100,
    "manual-only-price": 13500,
    "bgs-10-price": 21000,
    "condition-17-price": 0,
  };

  it("parses pennies and the card number", () => {
    const p = parsePriceChartingProduct(raw)!;
    expect(p).toMatchObject({ externalId: "123", name: "Charizard ex", number: "228", setName: "Obsidian Flames", language: "EN" });
    const byKey = Object.fromEntries(p.fields.map((f) => [f.key, f.nativeCents]));
    expect(byKey["loose-price"]).toBe(3200);
    expect(byKey["manual-only-price"]).toBe(13500);
    expect(byKey["condition-17-price"]).toBeNull(); // 0 = no data
    expect(parsePriceChartingProduct({ status: "error" })).toBeNull();
    expect(parsePriceChartingSearch({ products: [raw] })).toHaveLength(1);
  });

  it("maps condition to the right grade slot", () => {
    const p = parsePriceChartingProduct(raw)!;
    expect(suggestPriceChartingField(p, { conditionType: "raw", grader: null, grade: null })).toBe("loose-price");
    expect(suggestPriceChartingField(p, { conditionType: "graded", grader: "PSA", grade: "10" })).toBe("manual-only-price");
    expect(suggestPriceChartingField(p, { conditionType: "graded", grader: "BGS", grade: "10" })).toBe("bgs-10-price");
    expect(suggestPriceChartingField(p, { conditionType: "graded", grader: "CGC", grade: "9" })).toBe("graded-price");
    expect(suggestPriceChartingField(p, { conditionType: "graded", grader: "TAG", grade: "10" })).toBe("manual-only-price");
  });

  it("detects Japanese sets", () => {
    expect(parsePriceChartingProduct({ ...raw, "console-name": "Pokemon Japanese VMAX Climax" })!.language).toBe("JP");
  });
});

describe("offline sample responses", () => {
  it("are deterministic per date and parse like the real thing", () => {
    const a = parseTcgdexCard(fixtureResponse("https://api.tcgdex.net/v2/en/cards/sv03-228", "2026-10-01"), "en")!;
    const b = parseTcgdexCard(fixtureResponse("https://api.tcgdex.net/v2/en/cards/sv03-228", "2026-10-01"), "en")!;
    expect(a.fields).toEqual(b.fields);
    expect(a.fields.find((f) => f.key === "tcgplayer.holofoil.market")!.nativeCents).toBeGreaterThan(0);
  });
});

describe("price alerts", () => {
  const hist = (pairs: [string, number][]): HistoryPoint[] => pairs.map(([onDate, priceCents]) => ({ onDate, priceCents }));
  const today = "2026-10-15";

  it("fires a ±% move once per window", () => {
    const history = hist([["2026-10-08", 10000], ["2026-10-14", 11000], [today, 11600]]);
    const rule = { id: null, kind: "move_pct" as const, thresholdBps: 1500, windowDays: 7, targetCents: null };
    const fired = evaluateAlerts({ cardName: "Charizard ex", today, history, rules: [rule], pastEvents: [] });
    expect(fired).toHaveLength(1);
    expect(fired[0].changeBps).toBe(1600);
    expect(fired[0].message).toContain("up 16.0% in 7 days");
    const again = evaluateAlerts({ cardName: "x", today, history, rules: [rule], pastEvents: [{ alertId: null, kind: "move_pct", onDate: "2026-10-12", acknowledged: true }] });
    expect(again).toHaveLength(0);
  });

  it("ignores small moves and missing history", () => {
    const rule = { id: null, kind: "move_pct" as const, thresholdBps: 1500, windowDays: 7, targetCents: null };
    expect(evaluateAlerts({ cardName: "x", today, history: hist([["2026-10-08", 10000], [today, 10500]]), rules: [rule], pastEvents: [] })).toHaveLength(0);
    expect(evaluateAlerts({ cardName: "x", today, history: hist([[today, 10500]]), rules: [rule], pastEvents: [] })).toHaveLength(0);
    expect(evaluateAlerts({ cardName: "x", today, history: hist([["2026-10-08", 10000], ["2026-10-14", 99999]]), rules: [rule], pastEvents: [] })).toHaveLength(0);
  });

  it("detects drops too", () => {
    const rule = { id: "r", kind: "move_pct" as const, thresholdBps: 1000, windowDays: 3, targetCents: null };
    const fired = evaluateAlerts({ cardName: "x", today, history: hist([["2026-10-12", 10000], [today, 8500]]), rules: [rule], pastEvents: [] });
    expect(fired[0].changeBps).toBe(-1500);
  });

  it("fires above/below targets when crossed, not every day after", () => {
    const above = { id: "a", kind: "above" as const, thresholdBps: null, windowDays: 7, targetCents: 5000 };
    const crossed = hist([["2026-10-14", 4900], [today, 5100]]);
    expect(evaluateAlerts({ cardName: "x", today, history: crossed, rules: [above], pastEvents: [] })).toHaveLength(1);
    const stillAbove = hist([["2026-10-14", 5200], [today, 5300]]);
    expect(evaluateAlerts({ cardName: "x", today, history: stillAbove, rules: [above], pastEvents: [{ alertId: "a", kind: "above", onDate: "2026-10-14", acknowledged: true }] })).toHaveLength(0);
    // Never alerted before but already above (rule just created): tell them once.
    expect(evaluateAlerts({ cardName: "x", today, history: stillAbove, rules: [above], pastEvents: [] })).toHaveLength(1);
    // Dismissed earlier and no previous day to compare: don't nag again.
    expect(evaluateAlerts({ cardName: "x", today, history: hist([[today, 5300]]), rules: [above], pastEvents: [{ alertId: "a", kind: "above", onDate: "2026-09-01", acknowledged: true }] })).toHaveLength(0);
    // Went back under, then crossed again: alert again.
    expect(evaluateAlerts({ cardName: "x", today, history: hist([["2026-10-14", 4800], [today, 5300]]), rules: [above], pastEvents: [{ alertId: "a", kind: "above", onDate: "2026-09-01", acknowledged: true }] })).toHaveLength(1);
    const below = { id: "b", kind: "below" as const, thresholdBps: null, windowDays: 7, targetCents: 3000 };
    expect(evaluateAlerts({ cardName: "x", today, history: hist([["2026-10-14", 3100], [today, 2900]]), rules: [below], pastEvents: [] })[0].message).toContain("at or below");
  });
});
