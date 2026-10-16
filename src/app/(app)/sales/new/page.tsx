import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getSettings, listActiveInventory } from "@/server/inventory";
import { formLookups } from "@/server/lookups";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Record sale" };

export default async function NewSalePage({ searchParams }: PageProps<"/sales/new">) {
  const sp = await searchParams;
  const claims = await requireClaims();
  const data = await db(async (tx) => ({
    items: await listActiveInventory(tx),
    lookups: await formLookups(tx, claims.sub),
    settings: await getSettings(tx),
  }));
  const preselect = typeof sp.item === "string" ? sp.item : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Record a sale" description="One card or a bundle. Profit is worked out for you." />
      <SaleForm
        items={data.items}
        lookups={data.lookups}
        today={todayISO()}
        preselect={preselect}
        ebayFee={{ bps: data.settings.ebayFeeBps, fixed: data.settings.ebayFeeFixedCents }}
      />
    </div>
  );
}
