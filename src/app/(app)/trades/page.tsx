import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CardThumb, Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { CHANNELS } from "@/lib/labels";
import { listTrades } from "@/server/trades";
import { VoidTradeButton } from "./void-trade";

export const metadata: Metadata = { title: "Trades" };

export default async function TradesPage() {
  const rows = await db((tx) => listTrades(tx));
  return (
    <div>
      <PageHeader
        title="Trades"
        description="Cards out realize profit at the agreed value; cards in get that value as their cost."
        actions={
          <Button asChild size="sm">
            <Link href="/trades/new">
              <ArrowLeftRight /> New trade
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight />} title="No trades yet" action={<Button asChild><Link href="/trades/new">Record a trade</Link></Button>}>
          Several cards out, several in, and cash either way.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Trade #{t.tradeNo}
                    {t.counterparty ? <span className="font-normal text-muted-foreground"> with {t.counterparty}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.tradedOn)} · {CHANNELS[t.channel]}
                    {t.partner ? ` · ${t.partner}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-right text-sm">
                    <span className="block text-xs text-muted-foreground">realized</span>
                    <Money cents={t.realizedProfitCents} pl className="font-semibold" />
                  </span>
                  <VoidTradeButton id={t.id} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Side title="Out" icon={<ArrowUpRight className="size-4 text-loss" />} lines={t.out} cash={t.cashOutCents} />
                <Side title="In" icon={<ArrowDownLeft className="size-4 text-profit" />} lines={t.in} cash={t.cashInCents} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Side({
  title,
  icon,
  lines,
  cash,
}: {
  title: string;
  icon: React.ReactNode;
  lines: { itemId: string; cardName: string; imageUrl: string | null; quantity: number; agreedValueCents: number }[];
  cash: number;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {icon} {title}
      </p>
      <ul className="space-y-1.5">
        {lines.map((l) => (
          <li key={l.itemId}>
            <Link href={`/inventory/${l.itemId}`} className="flex items-center gap-2 text-sm">
              <CardThumb name={l.cardName} imageUrl={l.imageUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate">
                {l.cardName}
                {l.quantity > 1 ? ` ×${l.quantity}` : ""}
              </span>
              <Money cents={l.agreedValueCents} />
            </Link>
          </li>
        ))}
        {cash ? (
          <li className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cash</span>
            <Money cents={cash} />
          </li>
        ) : null}
        {!lines.length && !cash ? <li className="text-sm text-muted-foreground">Nothing</li> : null}
      </ul>
    </div>
  );
}
