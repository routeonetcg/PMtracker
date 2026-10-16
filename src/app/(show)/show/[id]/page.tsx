import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/auth";
import { loadEventReport } from "@/server/events";
import { getSettings, listInventory } from "@/server/inventory";
import { ShowMode } from "./show-mode";

export const metadata: Metadata = { title: "Show Mode" };

export default async function ShowModePage({ params }: PageProps<"/show/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await db(async (tx) => {
    const r = await loadEventReport(tx, id);
    if (!r) return null;
    return {
      r,
      items: await listInventory(tx, { statuses: ["in_stock", "listed", "on_hold"] }),
      settings: await getSettings(tx),
    };
  });
  if (!data) notFound();
  if (data.r.event.status !== "live") redirect(`/events/${id}`);
  const { r } = data;
  return (
    <ShowMode
      event={{ id: r.event.id, name: r.event.name }}
      items={data.items.map((i) => ({
        id: i.id,
        itemNo: i.itemNo,
        name: i.card.name,
        setName: i.card.setName,
        number: i.card.number,
        language: i.card.language,
        imageUrl: i.card.imageUrl,
        photoId: i.photoId,
        condition: i.conditionType === "graded" ? `${i.grader} ${Number(i.grade)}` : (i.rawCondition ?? "Raw"),
        quantity: i.quantity,
        status: i.status,
        askingCents: i.effectiveAskingCents,
        marketCents: i.marketCents,
        tags: i.tags,
        certNumber: i.certNumber,
      }))}
      totals={{
        salesCount: r.report.salesCount,
        revenueCents: r.report.revenueCents,
        expectedCashCents: r.report.cash.expectedCashCents,
        digitalCents: r.report.cash.digitalInCents,
      }}
      recent={r.sales.slice(0, 5).map((s) => ({
        id: s.id,
        name: s.lines.length === 1 ? s.lines[0].cardName : `Bundle · ${s.lines.length}`,
        priceCents: s.priceCents,
        method: s.paymentMethod,
      }))}
      cardFee={{ bps: data.settings.cardFeeBps, fixed: data.settings.cardFeeFixedCents }}
      renderedAt={new Date().toISOString()}
    />
  );
}
