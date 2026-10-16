import { NextResponse } from "next/server";
import { db } from "@/lib/auth";
import { money, toCsv } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { CHANNELS, PAYMENT_METHODS } from "@/lib/labels";
import { listSales } from "@/server/sales";

/** One row per card sold (bundles show their split). */
export async function GET() {
  const sales = await db((tx) => listSales(tx));
  const rows = sales.flatMap((s) =>
    s.lines.map((l) => [
      s.saleNo,
      s.soldOn,
      CHANNELS[s.channel],
      PAYMENT_METHODS[s.paymentMethod],
      s.soldBy,
      s.eventName,
      l.itemNo,
      l.cardName,
      l.setName,
      l.number,
      l.quantity,
      money(l.priceCents),
      money(l.feesCents),
      money(l.shippingCents),
      money(l.costBasisCents),
      money(l.priceCents - l.feesCents - l.shippingCents - l.costBasisCents),
      l.costMissing ? "yes" : "",
      s.buyerNote,
    ]),
  );
  const csv = toCsv(
    ["sale_no", "date", "channel", "payment", "sold_by", "event", "item_no", "card", "set", "number", "quantity", "price", "fees", "shipping", "cost_basis", "profit", "cost_missing", "buyer_note"],
    rows,
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="route-one-sales-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
