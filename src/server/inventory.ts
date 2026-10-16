import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { cards, holders, inventoryItems, itemPhotos, settings } from "@/db/schema";
import { todayISO, daysBetween } from "@/lib/dates";
import { ACTIVE_STATUSES, type ItemStatus } from "@/lib/labels";
import { costBasis, effectiveAsking, splitRowCost, unrealized } from "@/lib/money";

export type Settings = typeof settings.$inferSelect;

export async function getSettings(tx: Tx): Promise<Settings> {
  const [row] = await tx.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("Settings row missing — run `pnpm db:seed`.");
  return row;
}

const primaryPhoto = sql<string | null>`(
  select p.id from ${itemPhotos} p where p.item_id = ${inventoryItems.id} order by p.sort, p.created_at limit 1
)`;

export const itemSelect = {
  id: inventoryItems.id,
  itemNo: inventoryItems.itemNo,
  cardId: inventoryItems.cardId,
  quantity: inventoryItems.quantity,
  conditionType: inventoryItems.conditionType,
  rawCondition: inventoryItems.rawCondition,
  grader: inventoryItems.grader,
  grade: inventoryItems.grade,
  gradeLabel: inventoryItems.gradeLabel,
  certNumber: inventoryItems.certNumber,
  status: inventoryItems.status,
  location: inventoryItems.location,
  holderId: inventoryItems.holderId,
  holderName: holders.name,
  tags: inventoryItems.tags,
  notes: inventoryItems.notes,
  purchaseCents: inventoryItems.purchaseCents,
  feesCents: inventoryItems.feesCents,
  shippingCents: inventoryItems.shippingCents,
  gradingCents: inventoryItems.gradingCents,
  acquisitionId: inventoryItems.acquisitionId,
  acquiredOn: inventoryItems.acquiredOn,
  askingMode: inventoryItems.askingMode,
  askingCents: inventoryItems.askingCents,
  markupBps: inventoryItems.markupBps,
  marketCents: inventoryItems.marketCents,
  marketSource: inventoryItems.marketSource,
  marketUpdatedAt: inventoryItems.marketUpdatedAt,
  updatedAt: inventoryItems.updatedAt,
  photoId: primaryPhoto,
  card: {
    name: cards.name,
    setName: cards.setName,
    setCode: cards.setCode,
    number: cards.number,
    language: cards.language,
    rarity: cards.rarity,
    variants: cards.variants,
    imageUrl: cards.imageUrl,
  },
};

type RawItem = Awaited<ReturnType<typeof selectItems>>[number];

function selectItems(tx: Tx, where?: SQL) {
  return tx
    .select(itemSelect)
    .from(inventoryItems)
    .innerJoin(cards, eq(cards.id, inventoryItems.cardId))
    .leftJoin(holders, eq(holders.id, inventoryItems.holderId))
    .where(where)
    .orderBy(desc(inventoryItems.itemNo));
}

export type InventoryRow = RawItem & {
  costBasisCents: number;
  costMissing: boolean;
  effectiveAskingCents: number | null;
  /** Unrealized P/L for the whole row (market × qty − cost), null without a market price. */
  unrealizedCents: number | null;
  marketTotalCents: number | null;
  daysInStock: number;
  stale: boolean;
};

export function enrich(row: RawItem, s: Pick<Settings, "staleDays" | "roundAskingToCents">, today = todayISO()): InventoryRow {
  const cost = costBasis(row);
  const asking = effectiveAsking({
    askingMode: row.askingMode,
    askingCents: row.askingCents,
    markupBps: row.markupBps,
    marketCents: row.marketCents,
    roundUpToCents: s.roundAskingToCents,
  });
  const stale =
    row.marketCents !== null &&
    (!row.marketUpdatedAt || daysBetween(todayISO(row.marketUpdatedAt), today) > s.staleDays);
  return {
    ...row,
    costBasisCents: cost,
    costMissing: row.purchaseCents === null,
    effectiveAskingCents: asking,
    unrealizedCents: unrealized(row.marketCents, row.quantity, cost),
    marketTotalCents: row.marketCents === null ? null : row.marketCents * row.quantity,
    daysInStock: Math.max(0, daysBetween(row.acquiredOn, today)),
    stale,
  };
}

export async function listInventory(tx: Tx, opts: { statuses?: ItemStatus[] } = {}): Promise<InventoryRow[]> {
  const s = await getSettings(tx);
  const rows = await selectItems(tx, opts.statuses ? inArray(inventoryItems.status, opts.statuses) : undefined);
  const today = todayISO();
  return rows.map((r) => enrich(r, s, today));
}

export async function listActiveInventory(tx: Tx) {
  return listInventory(tx, { statuses: ACTIVE_STATUSES });
}

export async function getItem(tx: Tx, id: string): Promise<InventoryRow | null> {
  const s = await getSettings(tx);
  const [row] = await selectItems(tx, eq(inventoryItems.id, id));
  return row ? enrich(row, s) : null;
}

export async function getItemPhotos(tx: Tx, itemId: string) {
  return tx.select().from(itemPhotos).where(eq(itemPhotos.itemId, itemId)).orderBy(asc(itemPhotos.sort), asc(itemPhotos.createdAt));
}

type CardFields = {
  name: string;
  setName: string;
  setCode: string | null;
  number: string | null;
  language: "EN" | "JP";
  rarity: string | null;
  variants: (typeof cards.$inferInsert)["variants"];
  imageUrl: string | null;
};

/** Reuse an existing card record when name/set/number/language/variants match; otherwise create it. */
export async function findOrCreateCard(tx: Tx, c: CardFields): Promise<string> {
  const variants = [...(c.variants ?? [])].sort();
  const existing = await tx
    .select({ id: cards.id, variants: cards.variants, rarity: cards.rarity, imageUrl: cards.imageUrl })
    .from(cards)
    .where(
      and(
        ilike(cards.name, c.name),
        ilike(cards.setName, c.setName),
        c.number ? ilike(cards.number, c.number) : isNull(cards.number),
        eq(cards.language, c.language),
      ),
    );
  const match = existing.find((e) => [...e.variants].sort().join() === variants.join());
  if (match) {
    if ((!match.rarity && c.rarity) || (!match.imageUrl && c.imageUrl)) {
      await tx
        .update(cards)
        .set({ rarity: match.rarity ?? c.rarity, imageUrl: match.imageUrl ?? c.imageUrl })
        .where(eq(cards.id, match.id));
    }
    return match.id;
  }
  const [created] = await tx
    .insert(cards)
    .values({ ...c, variants })
    .returning({ id: cards.id });
  return created.id;
}

/**
 * Take `take` copies out of a row for a sale/trade/grading. When the row has
 * more copies, it is split: the original row keeps the remaining copies (and
 * stays where it is); a new row holds the taken copies with their exact share
 * of each cost component. Returns the row id holding the taken copies.
 */
export async function takeCopies(tx: Tx, itemId: string, take: number, newStatus: ItemStatus): Promise<{ id: string; costBasisCents: number; costMissing: boolean }> {
  const [row] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).for("update");
  if (!row) throw new UserError("A card in this sale no longer exists.");
  if (!ACTIVE_STATUSES.includes(row.status)) {
    throw new UserError(`#${row.itemNo} is already ${row.status.replace("_", " ")}.`);
  }
  if (take > row.quantity) throw new UserError(`#${row.itemNo} only has ${row.quantity} in stock.`);

  if (take === row.quantity) {
    await tx.update(inventoryItems).set({ status: newStatus }).where(eq(inventoryItems.id, itemId));
    return { id: row.id, costBasisCents: costBasis(row), costMissing: row.purchaseCents === null };
  }

  const { taken, remaining } = splitRowCost(row, row.quantity, take);
  await tx
    .update(inventoryItems)
    .set({ quantity: row.quantity - take, ...remaining })
    .where(eq(inventoryItems.id, itemId));
  const { id: _id, itemNo: _no, createdAt: _c, updatedAt: _u, createdBy: _b, ...copy } = row;
  const [created] = await tx
    .insert(inventoryItems)
    .values({ ...copy, ...taken, quantity: take, status: newStatus, parentItemId: row.id })
    .returning({ id: inventoryItems.id });
  // The split-off copies keep the same photos.
  const photos = await tx.select().from(itemPhotos).where(eq(itemPhotos.itemId, row.id));
  if (photos.length) {
    await tx.insert(itemPhotos).values(photos.map((p) => ({ itemId: created.id, storagePath: p.storagePath, sort: p.sort })));
  }
  return { id: created.id, costBasisCents: costBasis(taken), costMissing: taken.purchaseCents === null };
}

export async function listHolders(tx: Tx) {
  return tx.select().from(holders).orderBy(asc(holders.sort));
}

export async function allTags(tx: Tx): Promise<string[]> {
  const rows = await tx.execute<{ tag: string }>(
    sql`select distinct unnest(tags) as tag from ${inventoryItems} order by 1`,
  );
  return rows.map((r) => r.tag);
}

/** Error whose message is safe to show to the user. */
export class UserError extends Error {}
