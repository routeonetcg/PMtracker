import { ArrowLeft, Banknote, CreditCard, MapPin, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardThumb, Money, Pct } from "@/components/display";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { loadEventReport } from "@/server/events";
import { formLookups } from "@/server/lookups";
import { toDraft } from "../draft";
import { EventDialog } from "../event-form";
import { EventControls } from "./event-controls";

export const metadata: Metadata = { title: "Show report" };

const STATUS = { planned: { label: "Planned", v: "info" }, live: { label: "Live", v: "default" }, closed: { label: "Closed", v: "muted" } } as const;

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const claims = await requireClaims();
  const data = await db(async (tx) => ({ r: await loadEventReport(tx, id), lookups: await formLookups(tx, claims.sub) }));
  if (!data.r) notFound();
  const { event: e, report: r, sales, trades, buys, expenses } = data.r;
  const { lookups } = data;
  const cashHolder = lookups.holders.find((h) => h.id === e.cashHolderId)?.name;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Shows
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant={STATUS[e.status].v}>{STATUS[e.status].label}</Badge>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{e.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {formatDate(e.startsOn)}
              {e.endsOn && e.endsOn !== e.startsOn ? ` – ${formatDate(e.endsOn)}` : ""}
            </span>
            {e.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {e.location}
              </span>
            ) : null}
          </p>
        </div>
        <EventDialog holders={lookups.holders} myHolderId={lookups.myHolderId} today={todayISO()} existing={toDraft(e)} />
      </div>

      <EventControls
        event={{ id: e.id, status: e.status, cashHolderId: e.cashHolderId, floatCents: e.floatCents, countedCashCents: e.countedCashCents }}
        holders={lookups.holders}
        myHolderId={lookups.myHolderId}
        expectedCashCents={r.cash.expectedCashCents}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Show totals">
        <Tile label="Revenue" value={<Money cents={r.revenueCents} />} sub={`${r.salesCount} sales · ${r.cardsSold} cards`} />
        <Tile label="Gross profit" value={<Money cents={r.grossProfitCents} pl />} sub={r.tradeProfitCents ? `incl. trades` : "after fees & cost"} />
        <Tile label="Net profit" value={<Money cents={r.netProfitCents} pl />} sub={`after ${expenses.length} expense(s)`} highlight />
        <Tile label="Average sale" value={<Money cents={r.avgSaleCents} />} sub={<>margin <Pct bps={r.marginBps} /></>} />
      </section>
      {r.costMissingLines ? (
        <p className="text-sm text-warning">{r.costMissingLines} card(s) sold here have no cost entered, so profit is overstated.</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={cn(e.status !== "planned" && "border-primary/40")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-4 text-gold" /> Cash box
            </CardTitle>
            {cashHolder ? <span className="text-xs text-muted-foreground">held by {cashHolder}</span> : null}
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              <Row label="Starting cash" value={<Money cents={r.cash.floatCents} />} />
              <Row label="+ Cash taken" value={<Money cents={r.cash.cashInCents} />} />
              <Row label="− Cash paid out (buys, trades, expenses)" value={<Money cents={r.cash.cashOutCents} />} />
              <div className="my-1 border-t" />
              <Row label="Should be in the box" value={<Money cents={r.cash.expectedCashCents} className="text-base font-bold" />} />
              {r.cash.countedCashCents !== null ? (
                <>
                  <Row label="Counted" value={<Money cents={r.cash.countedCashCents} />} />
                  <Row
                    label="Over / short"
                    value={
                      r.cash.differenceCents === 0 ? (
                        <span className="font-semibold text-profit">Exact</span>
                      ) : (
                        <Money cents={r.cash.differenceCents} pl className="font-semibold" />
                      )
                    }
                  />
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-gold" /> Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.byPayment.length ? (
              <dl className="space-y-1.5 text-sm">
                {r.byPayment.map((p) => (
                  <Row key={p.method} label={`${PAYMENT_METHODS[p.method]} · ${p.count}`} value={<Money cents={p.cents} />} />
                ))}
                <div className="my-1 border-t" />
                <Row label="Cash" value={<Money cents={r.cash.cashInCents} />} />
                <Row label="Digital (Venmo, PayPal, Zelle, card…)" value={<Money cents={r.cash.digitalInCents} />} />
                {r.feesCents ? <Row label="Card / platform fees" value={<Money cents={-r.feesCents} pl />} /> : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-gold" /> Best sellers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.bestSellers.length ? (
              <ol className="space-y-2 text-sm">
                {r.bestSellers.map((b, i) => (
                  <li key={b.cardId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-muted-foreground num">{i + 1}</span>
                      {b.cardName}
                      {b.quantity > 1 ? ` ×${b.quantity}` : ""}
                    </span>
                    <span className="text-right">
                      <Money cents={b.revenueCents} className="font-semibold" /> <Money cents={b.profitCents} pl className="text-xs" />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses, buys & trades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {expenses.map((x) => (
              <Row
                key={x.id}
                label={`${x.description}${x.paymentMethod ? ` · ${PAYMENT_METHODS[x.paymentMethod]}` : ""}`}
                value={<Money cents={x.amountCents} />}
                hint={EXPENSE_CATEGORIES[x.category]}
              />
            ))}
            {buys.map((b) => (
              <Row
                key={b.id}
                label={`Bought ${b.cards} card(s)${b.paymentMethod ? ` · ${PAYMENT_METHODS[b.paymentMethod]}` : ""}`}
                value={<Money cents={(b.priceCents ?? 0) + b.feesCents + b.shippingCents} />}
              />
            ))}
            {trades.map((t) => (
              <Row key={t.id} label={`Trade #${t.tradeNo}${t.counterparty ? ` with ${t.counterparty}` : ""}`} value={<Money cents={t.realizedProfitCents} pl />} />
            ))}
            {!expenses.length && !buys.length && !trades.length ? <p className="text-muted-foreground">Nothing yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales</CardTitle>
          <span className="text-xs text-muted-foreground num">{sales.length}</span>
        </CardHeader>
        <CardContent>
          {sales.length ? (
            <ul className="divide-y">
              {sales.map((s) => (
                <li key={s.id}>
                  <Link href={`/sales/${s.id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
                    <CardThumb name={s.lines[0]?.cardName ?? "Sale"} imageUrl={s.lines[0]?.imageUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.lines.length === 1 ? s.lines[0].cardName : `Bundle · ${s.lines.length} cards`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(s.createdAt)} · {PAYMENT_METHODS[s.paymentMethod]}
                        {s.soldBy ? ` · ${s.soldBy}` : ""}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <Money cents={s.priceCents} className="block font-semibold" />
                      <Money cents={s.profitCents} pl className="text-xs" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{e.status === "planned" ? "Start the show to sell in Show Mode." : "No sales recorded."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3.5", highlight && "border-primary/40 bg-gradient-to-br from-primary/10 to-card")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-muted-foreground">
        {label}
        {hint ? <span className="block text-[11px]">{hint}</span> : null}
      </dt>
      <dd className="shrink-0">{value}</dd>
    </div>
  );
}
