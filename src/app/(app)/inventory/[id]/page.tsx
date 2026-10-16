import { and, desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Clock, Pencil, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardThumb, cardSubtitle, Money, Pct, StatusBadge } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { acquisitions, activityLog, saleLines, sales, tradeLines, trades } from "@/db/schema";
import { db } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CHANNELS, conditionLabel, LOCATIONS, VARIANTS } from "@/lib/labels";
import { formatBps, mulDivRound, ratioBps } from "@/lib/money";
import { getItem, getItemPhotos } from "@/server/inventory";
import { DeleteItemButton, MarketPriceForm, PhotoManager } from "./item-client";

export const metadata: Metadata = { title: "Card" };

export default async function ItemPage({ params }: PageProps<"/inventory/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await db(async (tx) => {
    const item = await getItem(tx, id);
    if (!item) return null;
    const [photos, acq, sale, trade, history] = await Promise.all([
      getItemPhotos(tx, id),
      item.acquisitionId ? tx.select().from(acquisitions).where(eq(acquisitions.id, item.acquisitionId)) : Promise.resolve([]),
      tx
        .select({ sale: sales, line: saleLines })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(eq(saleLines.itemId, id)),
      tx
        .select({ trade: trades, line: tradeLines })
        .from(tradeLines)
        .innerJoin(trades, eq(trades.id, tradeLines.tradeId))
        .where(eq(tradeLines.itemId, id)),
      tx
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.tableName, "inventory_items"), eq(activityLog.rowId, id)))
        .orderBy(desc(activityLog.at))
        .limit(15),
    ]);
    return { item, photos, acq: acq[0] ?? null, sale: sale[0] ?? null, trade: trade[0] ?? null, history };
  });
  if (!data) notFound();
  const { item: r, photos, acq, sale, trade, history } = data;
  const active = ["in_stock", "listed", "on_hold", "in_grading"].includes(r.status);
  const unitCost = mulDivRound(r.costBasisCents, 1, r.quantity);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Inventory
      </Link>

      <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="space-y-3">
          <CardThumb photoId={photos[0]?.id} imageUrl={r.card.imageUrl} name={r.card.name} size="xl" className="mx-auto" />
          <PhotoManager itemId={r.id} photos={photos.map((p) => ({ id: p.id }))} />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} />
              <Badge variant={r.conditionType === "graded" ? "default" : "outline"}>{conditionLabel(r)}</Badge>
              {r.card.language === "JP" ? <Badge variant="info">Japanese</Badge> : null}
              {r.card.variants.map((v) => (
                <Badge key={v} variant="muted">
                  {VARIANTS[v]}
                </Badge>
              ))}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
              {r.card.name}
              {r.quantity > 1 ? <span className="text-muted-foreground"> ×{r.quantity}</span> : null}
            </h1>
            <p className="text-muted-foreground">
              {cardSubtitle(r.card)}
              {r.card.rarity ? ` · ${r.card.rarity}` : ""} · #{r.itemNo}
            </p>
            {r.certNumber ? <p className="text-sm text-muted-foreground">Cert #{r.certNumber}</p> : null}
          </div>

          {/* Market vs asking vs cost */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cost basis" value={r.costMissing ? <Badge variant="warning"><AlertTriangle /> missing</Badge> : <Money cents={r.costBasisCents} />} sub={r.quantity > 1 && !r.costMissing ? <>≈ <Money cents={unitCost} /> each</> : undefined} />
            <Stat label="Market" value={<Money cents={r.marketTotalCents} />} sub={r.marketSource ? `${r.marketSource} · ${r.marketUpdatedAt ? formatDate(r.marketUpdatedAt.toISOString()) : ""}` : "not set"} warn={r.stale} />
            <Stat label="Asking" value={<Money cents={r.effectiveAskingCents} />} sub={r.askingMode === "markup" ? `market + ${formatBps(r.markupBps ?? 0, 2)}` : "set price"} highlight />
            <Stat
              label="Unrealized P/L"
              value={r.costMissing ? "—" : <Money cents={r.unrealizedCents} pl />}
              sub={r.costMissing || r.unrealizedCents === null ? undefined : <Pct bps={ratioBps(r.unrealizedCents, r.costBasisCents)} pl />}
            />
          </div>
          {r.stale ? (
            <p className="flex items-center gap-2 text-sm text-warning">
              <Clock className="size-4" /> Market price is more than a week old.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {active ? (
              <Button asChild size="lg">
                <Link href={`/sales/new?item=${r.id}`}>
                  <ShoppingBag /> Sell
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="lg">
              <Link href={`/inventory/${r.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            {active ? <DeleteItemButton id={r.id} /> : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Update market price</CardTitle>
            </CardHeader>
            <CardContent>
              <MarketPriceForm id={r.id} current={r.marketCents} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
                <Detail label="Location" value={LOCATIONS[r.location]} />
                <Detail label="Held by" value={r.holderName ?? "—"} />
                <Detail label="Acquired" value={`${formatDate(r.acquiredOn)} (${r.daysInStock}d)`} />
                <Detail label="Purchase" value={<Money cents={r.purchaseCents} />} />
                <Detail label="Fees" value={<Money cents={r.feesCents} />} />
                <Detail label="Shipping" value={<Money cents={r.shippingCents} />} />
                <Detail label="Grading" value={<Money cents={r.gradingCents} />} />
                {acq ? <Detail label="Source" value={acq.source ?? acq.kind.replace("_", " ")} /> : null}
                {r.tags.length ? <Detail label="Tags" value={r.tags.join(", ")} /> : null}
              </dl>
              {r.notes ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{r.notes}</p> : null}
            </CardContent>
          </Card>

          {sale ? (
            <Card>
              <CardHeader>
                <CardTitle>Sold</CardTitle>
                <Link href={`/sales/${sale.sale.id}`} className="text-sm text-gold">
                  Sale #{sale.sale.saleNo} →
                </Link>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Detail label="Date" value={formatDate(sale.sale.soldOn)} />
                <Detail label="Channel" value={CHANNELS[sale.sale.channel]} />
                <Detail label="Price" value={<Money cents={sale.line.priceCents} />} />
                <Detail label="Profit" value={<Money cents={sale.line.priceCents - sale.line.feesCents - sale.line.shippingCents - sale.line.costBasisCents} pl />} />
              </CardContent>
            </Card>
          ) : null}
          {trade ? (
            <Card>
              <CardHeader>
                <CardTitle>{trade.line.direction === "out" ? "Traded away" : "Came in a trade"}</CardTitle>
                <Link href="/trades" className="text-sm text-gold">
                  Trade #{trade.trade.tradeNo} →
                </Link>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Detail label="Date" value={formatDate(trade.trade.tradedOn)} />
                <Detail label="Agreed value" value={<Money cents={trade.line.agreedValueCents} />} />
                <Detail label={trade.line.direction === "out" ? "Profit" : "Cost basis"} value={trade.line.direction === "out" ? <Money cents={trade.line.agreedValueCents - trade.line.costBasisCents} pl /> : <Money cents={trade.line.costBasisCents} />} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-muted-foreground">{formatDateTime(h.at)}</span>
                    <span className="min-w-0 truncate">
                      {h.action === "insert" ? "Added" : h.action === "delete" ? "Deleted" : `Changed ${Object.keys((h.changes as object) ?? {}).map((k) => k.replace(/_cents|_/g, " ").trim()).join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, highlight, warn }: { label: string; value: React.ReactNode; sub?: React.ReactNode; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-3 ${highlight ? "border-primary/40" : ""} ${warn ? "border-warning/50" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
