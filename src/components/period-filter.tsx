"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { PERIODS, type Period, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function PeriodFilter({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(period.from ?? "");
  const [to, setTo] = useState(period.to);

  function go(key: PeriodKey, extra?: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    params.set("period", key);
    params.delete("from");
    params.delete("to");
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    start(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("space-y-2", pending && "opacity-70")}>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Period">
        {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={period.key === k}
            onClick={() => (k === "custom" ? go("custom", { from: from || period.to, to }) : go(k))}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              period.key === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {PERIODS[k]}
          </button>
        ))}
      </div>
      {period.key === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" />
          <Button variant="outline" onClick={() => go("custom", { from, to })}>
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
