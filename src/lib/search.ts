/** Lowercase, strip accents (Pokémon → pokemon) and punctuation for matching. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word of the query must appear somewhere in the haystack. */
export function matches(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const h = normalize(haystack);
  return q.split(" ").every((w) => h.includes(w));
}

export function itemHaystack(r: {
  itemNo: number;
  card: { name: string; setName: string; setCode: string | null; number: string | null; language: string; rarity: string | null };
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  rawCondition: string | null;
  tags: string[];
  notes: string | null;
}): string {
  return [
    `#${r.itemNo}`,
    r.card.name,
    r.card.setName,
    r.card.setCode,
    r.card.number,
    r.card.language === "JP" ? "jp japanese" : "en english",
    r.card.rarity,
    r.grader ? `${r.grader} ${r.grader}${r.grade ? Number(r.grade) : ""} ${r.grade ? Number(r.grade) : ""}` : "raw",
    r.certNumber,
    r.rawCondition,
    ...r.tags,
    r.notes,
  ]
    .filter(Boolean)
    .join(" ");
}
