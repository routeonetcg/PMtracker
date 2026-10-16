import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/misc";
import { partners } from "@/db/schema";
import { db } from "@/lib/auth";
import { bpsToInput, centsToInput, formatBps } from "@/lib/money";
import { getSettings } from "@/server/inventory";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { settings, ps } = await db(async (tx) => ({
    settings: await getSettings(tx),
    ps: await tx.select().from(partners).orderBy(asc(partners.createdAt)),
  }));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" />
      <SettingsForm
        initial={{
          defaultMarkupPct: bpsToInput(settings.defaultMarkupBps),
          roundAskingTo: centsToInput(settings.roundAskingToCents),
          staleDays: String(settings.staleDays),
          slowMoverDays: String(settings.slowMoverDays),
          ebayFeePct: bpsToInput(settings.ebayFeeBps),
          ebayFeeFixed: centsToInput(settings.ebayFeeFixedCents),
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>Partners</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {ps.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-muted-foreground">{p.email}</span>
                </span>
                <span className="num">{formatBps(p.splitBps, 0)} split</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Profit split, contributions and payouts are managed on the Partners page (phase 4).</p>
        </CardContent>
      </Card>
    </div>
  );
}
