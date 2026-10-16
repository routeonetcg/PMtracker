import { AlertTriangle, Clock, Link2, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertsList } from "@/components/alerts-list";
import { CardThumb, cardSubtitle, Money } from "@/components/display";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { conditionLabel } from "@/lib/labels";
import { formatBps } from "@/lib/money";
import { getSettings, listActiveInventory } from "@/server/inventory";
import { providerStatus, usingFixtures } from "@/server/prices/providers";
import { failingFeeds, openAlerts } from "@/server/prices/queries";
import { RunPricesButton } from "./run-button";

export const metadata: Metadata = { title: "Prices" };

export default async function PricesPage() {
  const { items, alerts, failing, settings } = await db(async (tx) => ({
    items: await listActiveInventory(tx),
    alerts: await openAlerts(tx),
    failing: await failingFeeds(tx),
    settings: await getSettings(tx),
  }));
  const unlinked = items.filter((i) => !i.marketProductId);
  const stale = items.filter((i) => i.stale);
  const noPrice = items.filter((i) => i.marketCents === null);
  const linked = items.length - unlinked.length;
  const last = settings.priceJobLastResult as { updated?: number; failed?: number; itemsUpdated?: number; alertsFired?: number } | null;
  const rate = (settings.eurUsdPpm / 1_000_000).toFixed(4); // display only

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prices"
        description="Market prices update automatically every morning. Manual prices always win until you switch back to the feed."
        actions={<RunPricesButton />}
      />

      {usingFixtures() ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>Offline sample prices.</strong> PRICE_FIXTURES=1 is on, so prices come from built-in sample data, not the real
            providers. Never enable this in production.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Following a feed" value={`${linked} / ${items.length}`} sub="cards on hand" />
        <Stat label="No market price" value={String(noPrice.length)} sub="can't value these" warn={noPrice.length > 0} />
        <Stat label="Stale prices" value={String(stale.length)} sub={`older than ${settings.staleDays} days`} warn={stale.length > 0} />
        <Stat
          label="Last update"
          value={settings.priceJobLastRunAt ? formatDateTime(settings.priceJobLastRunAt) : "Never"}
          sub={last ? `${last.updated ?? 0} prices · ${last.failed ?? 0} failed · ${last.alertsFired ?? 0} alerts` : "runs daily at ~6am ET"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4 text-gold" /> Alerts
            </CardTitle>
            <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
              Default ±{formatBps(settings.defaultAlertBps, 0)} / {settings.alertWindowDays}d
            </Link>
          </CardHeader>
          <CardContent>
            <AlertsList alerts={alerts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {providerStatus().map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.cost}</span>
                </span>
                {p.enabled ? <Badge variant="success">on</Badge> : <Badge variant="muted">add key to enable</Badge>}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              EUR→USD {rate} (ECB{settings.eurUsdUpdatedAt ? `, ${formatDate(settings.eurUsdUpdatedAt.toISOString())}` : ", default"}). Manual prices are
              always available. No sites are scraped.
            </p>
          </CardContent>
        </Card>
      </div>

      {failing.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="size-4" /> Feeds that failed last update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {failing.map((f) => (
                <li key={f.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {f.productName} · {f.label}
                    <span className="block text-xs text-muted-foreground">{f.lastError}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{f.cards} card(s)</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ItemList title="Not linked to a price source" icon={<Link2 className="size-4 text-gold" />} items={unlinked} empty="Every card on hand follows a price feed." action="Link" />
      <ItemList title="Stale prices" icon={<Clock className="size-4 text-warning" />} items={stale} empty="No stale prices." action="Update" />
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-3.5 ${warn ? "border-warning/40" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold num">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ItemList({
  title,
  icon,
  items,
  empty,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  items: Awaited<ReturnType<typeof listActiveInventory>>;
  empty: string;
  action: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <span className="text-xs text-muted-foreground num">{items.length}</span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 100).map((i) => (
              <li key={i.id}>
                <Link href={`/inventory/${i.id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
                  <CardThumb photoId={i.photoId} imageUrl={i.card.imageUrl} name={i.card.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.card.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {cardSubtitle(i.card)} · {conditionLabel(i)}
                    </span>
                  </span>
                  <Money cents={i.marketCents} className="text-sm" />
                  <span className="text-xs font-semibold text-gold">{action} →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
