import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardThumb, cardSubtitle, Money } from "@/components/display";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { CHANNELS, PAYMENT_METHODS } from "@/lib/labels";
import { listSales } from "@/server/sales";
import { VoidSaleButton } from "./void-button";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({ params }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  const sale = (await db((tx) => listSales(tx))).find((s) => s.id === id);
  if (!sale) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Sales
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sale #{sale.saleNo}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(sale.soldOn)} · {CHANNELS[sale.channel]} · {PAYMENT_METHODS[sale.paymentMethod]}
            {sale.soldBy ? ` · sold by ${sale.soldBy}` : ""}
          </p>
          {sale.eventName ? <p className="text-sm text-muted-foreground">at {sale.eventName}</p> : null}
        </div>
        <VoidSaleButton id={sale.id} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="Price" value={<Money cents={sale.priceCents} />} />
        <Box label="Fees + shipping" value={<Money cents={sale.platformFeesCents + sale.shippingCostCents} />} />
        <Box label="Cost" value={<Money cents={sale.costBasisCents} />} />
        <Box label="Profit" value={<Money cents={sale.profitCents} pl />} />
      </div>
      {sale.costMissing ? <p className="text-sm text-warning">Some cards in this sale had no cost entered, so profit is overstated.</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{sale.lines.length > 1 ? "Bundle" : "Card"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {sale.lines.map((l) => (
              <li key={l.itemId} className="flex items-center gap-3 py-2.5">
                <CardThumb name={l.cardName} imageUrl={l.imageUrl} />
                <Link href={`/inventory/${l.itemId}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold hover:text-gold">
                    {l.cardName}
                    {l.quantity > 1 ? ` ×${l.quantity}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{cardSubtitle(l)}</p>
                  {l.costMissing ? <Badge variant="warning">cost missing</Badge> : null}
                </Link>
                <div className="text-right text-sm">
                  <Money cents={l.priceCents} className="block font-semibold" />
                  <Money cents={l.priceCents - l.feesCents - l.shippingCents - l.costBasisCents} pl />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {sale.buyerNote ? (
        <Card>
          <CardHeader>
            <CardTitle>Buyer note</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{sale.buyerNote}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Box({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
