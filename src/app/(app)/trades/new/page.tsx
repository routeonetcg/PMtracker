import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { bpsToInput } from "@/lib/money";
import { getSettings, listActiveInventory } from "@/server/inventory";
import { formLookups } from "@/server/lookups";
import { TradeForm } from "./trade-form";

export const metadata: Metadata = { title: "New trade" };

export default async function NewTradePage() {
  const claims = await requireClaims();
  const data = await db(async (tx) => ({
    items: await listActiveInventory(tx),
    lookups: await formLookups(tx, claims.sub),
    settings: await getSettings(tx),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New trade" description="Cards going out, cards coming in, and any cash." />
      <TradeForm items={data.items} lookups={data.lookups} today={todayISO()} defaultMarkupPct={bpsToInput(data.settings.defaultMarkupBps)} />
    </div>
  );
}
