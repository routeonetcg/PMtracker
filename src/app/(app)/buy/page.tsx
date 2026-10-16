import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { bpsToInput } from "@/lib/money";
import { getSettings } from "@/server/inventory";
import { formLookups } from "@/server/lookups";
import { BuyForm } from "./buy-form";

export const metadata: Metadata = { title: "Buy cards" };

export default async function BuyPage({ searchParams }: PageProps<"/buy">) {
  const sp = await searchParams;
  const claims = await requireClaims();
  const { lookups, settings } = await db(async (tx) => ({
    lookups: await formLookups(tx, claims.sub),
    settings: await getSettings(tx),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Buy cards" description="Add one card, or a bulk lot bought for one price — we split the cost across the cards." />
      <BuyForm
        lookups={lookups}
        today={todayISO()}
        defaultMarkupPct={bpsToInput(settings.defaultMarkupBps)}
        initialMode={sp.mode === "lot" ? "lot" : "single"}
      />
    </div>
  );
}
