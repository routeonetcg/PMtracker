import { AlertTriangle, BellRing, Boxes, PackagePlus, ShoppingBag, TrendingUp, Trophy, Turtle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertsList } from "@/components/alerts-list";
import { ChannelChart, InventoryValueChart, MonthlyChart } from "@/components/charts";
import { CardThumb, Money, Pct } from "@/components/display";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { resolvePeriod } from "@/lib/dates";
import { CHANNELS } from "@/lib/labels";
import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";
import { loadDashboard } from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const period = resolvePeriod(first(sp.period), first(sp.from), first(sp.to));
  const { metrics: m, costMissingInStock, slowMovers, settings, alerts, staleCount } = await db((tx) => loadDashboard(tx, period));
  const hasActivity = m.unitsSold > 0 || m.expensesCents > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{period.label}</p>
        </div>
        <div className="hidden gap-2 md:flex">
          <Button asChild variant="outline">
            <Link href="/buy">
              <PackagePlus /> Buy cards
            </Link>
          </Button>
          <Button asChild>
            <Link href="/sales/new">
              <ShoppingBag /> Record sale
            </Link>
          </Button>
        </div>
      </div>

      <PeriodFilter period={period} />

      {costMissingInStock > 0 || m.costMissingSold > 0 ? (
        <Link
          href="/inventory?cost=missing"
          className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>{costMissingInStock}</strong> card{costMissingInStock === 1 ? "" : "s"} in stock {costMissingInStock === 1 ? "has" : "have"} no cost yet
            {m.costMissingSold ? (
              <>
                , and <strong>{m.costMissingSold}</strong> sale line{m.costMissingSold === 1 ? "" : "s"} this period counted $0 cost (profit is overstated)
              </>
            ) : null}
            . <span className="font-semibold text-gold">Fill in costs →</span>
          </span>
        </Link>
      ) : null}

      {alerts.length ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-gold" /> Price alerts
            </CardTitle>
            <Link href="/prices" className="text-xs text-gold">
              All prices →
            </Link>
          </CardHeader>
          <CardContent>
            <AlertsList alerts={alerts} compact />
          </CardContent>
        </Card>
      ) : null}

      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key numbers">
        <Kpi label="Revenue" value={<Money cents={m.revenueCents} whole />} sub={m.tradeValueCents ? `incl. ${formatUSD(m.tradeValueCents, { whole: true })} in trades` : `${m.unitsSold} card${m.unitsSold === 1 ? "" : "s"} sold`} />
        <Kpi label="Gross profit" value={<Money cents={m.grossProfitCents} pl whole />} sub="after fees, shipping & cost" />
        <Kpi label="Net profit" value={<Money cents={m.netProfitCents} pl whole />} sub={`after ${formatUSD(m.expensesCents, { whole: true })} expenses`} highlight />
        <Kpi label="Net margin" value={<Pct bps={m.marginBps} pl />} sub="net profit ÷ revenue" />
        <Kpi label="Inventory at cost" value={<Money cents={m.inventoryCostCents} whole />} sub={`${m.unitsInStock} cards in stock`} />
        <Kpi
          label="Inventory at market"
          value={<Money cents={m.inventoryMarketCents} whole />}
          sub={[m.unpricedRows ? `${m.unpricedRows} unpriced` : "all priced", staleCount ? `${staleCount} stale` : null].filter(Boolean).join(" · ")}
        />
        <Kpi
          label="Unrealized P/L"
          value={<Money cents={m.unrealizedCents} pl whole />}
          sub={m.unrealizedExcludedRows ? `${m.unrealizedExcludedRows} skipped (no cost yet)` : "market − cost, priced cards"}
        />
        <Kpi
          label="Sell-through"
          value={<Pct bps={m.sellThroughBps} />}
          sub={m.avgDaysToSell === null ? "avg days to sell: —" : `avg ${m.avgDaysToSell} days to sell`}
        />
      </section>

      {!hasActivity ? (
        <EmptyState
          icon={<TrendingUp />}
          title="No sales in this period yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/sales/new">Record a sale</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/inventory">See inventory</Link>
              </Button>
            </div>
          }
        >
          Charts fill in as you record sales, trades and expenses. Try “All time” to see everything.
        </EmptyState>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue & net profit by month</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={m.monthly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventory value over time</CardTitle>
            <span className="text-xs text-muted-foreground">month end</span>
          </CardHeader>
          <CardContent>
            <InventoryValueChart data={m.inventoryOverTime} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profit by sales channel</CardTitle>
          </CardHeader>
          <CardContent>
            {m.byChannel.length ? (
              <ChannelChart data={m.byChannel.map((c) => ({ ...c, label: CHANNELS[c.channel] }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-gold" /> Top 10 most profitable cards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopCards rows={m.topCards} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Turtle className="size-4 text-gold" /> Slowest movers
          </CardTitle>
          <span className="text-xs text-muted-foreground">in stock over {settings.slowMoverDays} days</span>
        </CardHeader>
        <CardContent>
          {slowMovers.length ? (
            <ul className="divide-y">
              {slowMovers.map((s) => (
                <li key={s.id}>
                  <Link href={`/inventory/${s.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <CardThumb name={s.cardName} imageUrl={s.imageUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.cardName}</span>
                    <span className="text-sm text-muted-foreground num">{s.days}d</span>
                    <Money cents={s.costBasisCents} className="w-20 text-right text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Boxes className="size-4" /> Nothing has been sitting longer than {settings.slowMoverDays} days.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: string; highlight?: boolean }) {
  return (
    <div data-kpi={label} className={cn("rounded-xl border bg-card p-3.5 shadow-sm md:p-4", highlight && "border-primary/40 bg-gradient-to-br from-primary/10 to-card")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight md:text-2xl">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function TopCards({ rows }: { rows: { cardId: string; cardName: string; quantity: number; profitCents: number }[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.profitCents)), 1);
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.cardId} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-2 text-sm">
          <span className="text-xs text-muted-foreground num">{i + 1}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {r.cardName}
              {r.quantity > 1 ? <span className="text-muted-foreground"> ×{r.quantity}</span> : null}
            </p>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", r.profitCents >= 0 ? "bg-profit" : "bg-loss")}
                style={{ width: `${Math.max(3, (Math.abs(r.profitCents) / max) * 100)}%` }}
              />
            </div>
          </div>
          <Money cents={r.profitCents} pl whole className="text-right font-semibold" />
        </li>
      ))}
    </ol>
  );
}
