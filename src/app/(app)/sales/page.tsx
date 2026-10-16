import { HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CardThumb, Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { CHANNELS, PAYMENT_METHODS } from "@/lib/labels";
import { listSales } from "@/server/sales";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage() {
  const rows = await db((tx) => listSales(tx));
  const total = rows.reduce((a, r) => a + r.priceCents, 0);
  const profit = rows.reduce((a, r) => a + r.profitCents, 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        description={
          rows.length ? (
            <>
              {rows.length} sales · <Money cents={total} whole /> revenue · <Money cents={profit} pl whole /> profit
            </>
          ) : undefined
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href="/sales/export" download>
                Export CSV
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/sales/new">
                <HandCoins /> Record sale
              </Link>
            </Button>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={<HandCoins />} title="No sales yet" action={<Button asChild><Link href="/sales/new">Record your first sale</Link></Button>}>
          Every sale you record updates inventory, profit and the dashboard.
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/sales/${s.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/40 md:px-4">
                <div className="flex -space-x-5">
                  {s.lines.slice(0, 3).map((l) => (
                    <CardThumb key={l.itemId} name={l.cardName} imageUrl={l.imageUrl} />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {s.lines.length === 1 ? s.lines[0].cardName : `Bundle · ${s.lines.length} cards`}
                    {s.lines.length === 1 && s.lines[0].quantity > 1 ? ` ×${s.lines[0].quantity}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    #{s.saleNo} · {formatDate(s.soldOn)} · {CHANNELS[s.channel]} · {PAYMENT_METHODS[s.paymentMethod]}
                    {s.soldBy ? ` · ${s.soldBy}` : ""}
                    {s.eventName ? ` · ${s.eventName}` : ""}
                  </p>
                  {s.costMissing ? <Badge variant="warning" className="mt-1">cost missing</Badge> : null}
                </div>
                <div className="text-right">
                  <Money cents={s.priceCents} className="block font-semibold" />
                  <Money cents={s.profitCents} pl className="text-sm" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
