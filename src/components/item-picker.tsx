"use client";

import { Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { CardThumb, cardSubtitle, Money } from "@/components/display";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/misc";
import { conditionLabel } from "@/lib/labels";
import { itemHaystack, matches } from "@/lib/search";
import type { InventoryRow } from "@/server/inventory";

/** Search the on-hand inventory and pick a card (used by sales and trades). */
export function ItemPicker({
  open,
  onOpenChange,
  items,
  exclude,
  onPick,
  title = "Pick a card",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: InventoryRow[];
  exclude: string[];
  onPick: (item: InventoryRow) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const hay = useMemo(() => new Map(items.map((i) => [i.id, itemHaystack(i)])), [items]);
  const list = useMemo(
    () => items.filter((i) => !exclude.includes(i.id) && matches(hay.get(i.id) ?? "", dq)).slice(0, 60),
    [items, exclude, dq, hay],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="sm:max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus type="search" placeholder="Search name, set, number, cert…" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 pl-9 text-base" />
        </div>
        <ul className="-mx-2 max-h-[55dvh] divide-y overflow-y-auto">
          {list.length === 0 ? <li className="px-2 py-8 text-center text-sm text-muted-foreground">No cards on hand match.</li> : null}
          {list.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent"
                onClick={() => {
                  onPick(i);
                  setQ("");
                  onOpenChange(false);
                }}
              >
                <CardThumb photoId={i.photoId} imageUrl={i.card.imageUrl} name={i.card.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {i.card.name}
                    {i.quantity > 1 ? <span className="text-muted-foreground"> ×{i.quantity}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{cardSubtitle(i.card)}</span>
                  <Badge variant={i.conditionType === "graded" ? "default" : "outline"} className="mt-1">
                    {conditionLabel(i)}
                  </Badge>
                </span>
                <span className="text-right">
                  <Money cents={i.effectiveAskingCents} whole className="block font-semibold" />
                  <span className="text-xs text-muted-foreground">
                    mkt <Money cents={i.marketCents} whole />
                  </span>
                </span>
                <Plus className="size-4 text-gold" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
