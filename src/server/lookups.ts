import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { cards, events, holders, partners } from "@/db/schema";

/** Small reference lists most forms need. */
export async function formLookups(tx: Tx, userId: string) {
  const [hs, ps, evs, known] = await Promise.all([
    tx.select().from(holders).orderBy(asc(holders.sort)),
    tx.select().from(partners).orderBy(asc(partners.createdAt)),
    tx.select({ id: events.id, name: events.name, startsOn: events.startsOn, status: events.status }).from(events).orderBy(desc(events.startsOn)),
    tx
      .select({ name: cards.name, setName: cards.setName, setCode: cards.setCode, number: cards.number, language: cards.language, rarity: cards.rarity })
      .from(cards)
      .orderBy(asc(cards.name)),
  ]);
  const me = ps.find((p) => p.userId === userId) ?? ps[0];
  const myHolder = hs.find((h) => h.partnerId === me?.id) ?? hs[0];
  const seen = new Set<string>();
  const knownCards = known.filter((k) => {
    const key = `${k.name}|${k.setName}|${k.number}|${k.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    holders: hs.map((h) => ({ id: h.id, name: h.name, kind: h.kind })),
    partners: ps.map((p) => ({ id: p.id, name: p.displayName })),
    events: evs,
    knownCards,
    meId: me?.id ?? null,
    myHolderId: myHolder?.id ?? null,
  };
}
export type FormLookups = Awaited<ReturnType<typeof formLookups>>;

export async function partnerByUser(tx: Tx, userId: string) {
  const [p] = await tx.select().from(partners).where(eq(partners.userId, userId));
  return p ?? null;
}
