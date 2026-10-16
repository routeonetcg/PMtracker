"use client";

import { BellRing, Check, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { dismissAlertsAction } from "@/app/(app)/prices/actions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  itemId: string;
  kind: "move_pct" | "above" | "below";
  onDate: string;
  changeBps: number | null;
  message: string;
};

export function AlertsList({ alerts, compact = false }: { alerts: Alert[]; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const dismiss = (ids: string[]) =>
    start(async () => {
      const res = await dismissAlertsAction(ids);
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });

  if (!alerts.length) {
    return <p className="py-3 text-sm text-muted-foreground">No price alerts right now.</p>;
  }
  return (
    <div className={cn("space-y-2", pending && "opacity-60")}>
      <ul className="divide-y">
        {alerts.map((a) => {
          const up = a.kind === "above" || (a.changeBps ?? 0) > 0;
          const Icon = a.kind === "move_pct" ? (up ? TrendingUp : TrendingDown) : BellRing;
          return (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", up ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss")}>
                <Icon className="size-4" aria-label={up ? "up" : "down"} />
              </span>
              <Link href={`/inventory/${a.itemId}`} className="min-w-0 flex-1 text-sm hover:text-gold">
                <span className="line-clamp-2">{a.message}</span>
                {!compact ? <span className="text-xs text-muted-foreground">{formatDate(a.onDate)}</span> : null}
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label="Dismiss alert" onClick={() => dismiss([a.id])}>
                <Check />
              </Button>
            </li>
          );
        })}
      </ul>
      {alerts.length > 1 ? (
        <Button variant="ghost" size="sm" onClick={() => dismiss(alerts.map((a) => a.id))}>
          Dismiss all
        </Button>
      ) : null}
    </div>
  );
}
