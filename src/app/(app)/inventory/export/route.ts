import { NextResponse } from "next/server";
import { db } from "@/lib/auth";
import { INVENTORY_COLUMNS, money, toCsv } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { LOCATIONS, STATUSES } from "@/lib/labels";
import { bpsToInput } from "@/lib/money";
import { listInventory } from "@/server/inventory";

export async function GET() {
  const rows = await db((tx) => listInventory(tx));
  const csv = toCsv(
    [...INVENTORY_COLUMNS],
    rows.map((r) => [
      r.itemNo,
      r.card.name,
      r.card.setName,
      r.card.setCode,
      r.card.number,
      r.card.language,
      r.card.rarity,
      r.card.variants.join(";"),
      r.conditionType === "raw" ? r.rawCondition : `${r.grader} ${Number(r.grade)}`,
      r.grader,
      r.grade ? String(Number(r.grade)) : "",
      r.gradeLabel,
      r.certNumber,
      r.quantity,
      STATUSES[r.status],
      LOCATIONS[r.location],
      r.holderName,
      r.tags.join(";"),
      money(r.purchaseCents),
      money(r.feesCents),
      money(r.shippingCents),
      money(r.gradingCents),
      r.costMissing ? "" : money(r.costBasisCents),
      r.acquiredOn,
      money(r.marketCents),
      r.marketSource,
      r.marketUpdatedAt?.toISOString().slice(0, 10),
      r.askingMode,
      money(r.effectiveAskingCents),
      r.markupBps === null ? "" : bpsToInput(r.markupBps),
      r.notes,
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="route-one-inventory-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
