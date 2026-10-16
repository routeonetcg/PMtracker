"use client";

import { ArrowLeftRight, Banknote, CloudOff, FileText, Loader2, Minus, PackagePlus, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { voidSaleAction } from "@/app/(app)/sales/actions";
import { CardThumb, Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, MoneyInput } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/misc";
import { type PaymentMethod, PAYMENT_METHODS, RAW_CONDITIONS, type RawCondition } from "@/lib/labels";
import { centsToInput, estimateFee, formatUSD, parseDollars } from "@/lib/money";
import { matches } from "@/lib/search";
import { cn } from "@/lib/utils";
import { showBuyAction, showSellAction } from "@/app/(app)/events/actions";

type Item = {
  id: string;
  itemNo: number;
  name: string;
  setName: string;
  number: string | null;
  language: "EN" | "JP";
  imageUrl: string | null;
  photoId: string | null;
  condition: string;
  quantity: number;
  status: string;
  askingCents: number | null;
  marketCents: number | null;
  tags: string[];
  certNumber: string | null;
};

type Totals = { salesCount: number; revenueCents: number; expectedCashCents: number; digitalCents: number };
type Recent = { id: string; name: string; priceCents: number; method: PaymentMethod };
type Queued = { clientRef: string; eventId: string; itemId: string; quantity: number; price: string; paymentMethod: PaymentMethod; name: string; priceCents: number };

const PAY_BUTTONS: PaymentMethod[] = ["cash", "venmo", "zelle", "paypal", "card"];
const queueKey = (eventId: string) => `r1-show-queue-${eventId}`;

function loadQueue(eventId: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(eventId)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function saveQueue(eventId: string, q: Queued[]) {
  try {
    localStorage.setItem(queueKey(eventId), JSON.stringify(q));
  } catch {
    /* storage unavailable (private mode) */
  }
  window.dispatchEvent(new Event("r1-queue"));
}

/** The offline queue lives in localStorage so it survives a reload or a dead battery. */
function useQueue(eventId: string): Queued[] {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("r1-queue", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("r1-queue", cb);
      };
    },
    () => {
      try {
        return localStorage.getItem(queueKey(eventId)) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  return useMemo(() => {
    try {
      return JSON.parse(raw) as Queued[];
    } catch {
      return [];
    }
  }, [raw]);
}

type Optimistic = { key: string; sold: Record<string, number>; count: number; revenue: number; cash: number; digital: number };
const emptyOptimistic = (key: string): Optimistic => ({ key, sold: {}, count: 0, revenue: 0, cash: 0, digital: 0 });

/** A rejected server-action call (no response at all) means the network dropped. */
const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));

export function ShowMode({
  event,
  items,
  totals,
  recent,
  cardFee,
  renderedAt,
}: {
  renderedAt: string;
  event: { id: string; name: string };
  items: Item[];
  totals: Totals;
  recent: Recent[];
  cardFee: { bps: number; fixed: number };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [selected, setSelected] = useState<Item | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const queue = useQueue(event.id);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sales sent but not yet reflected in the server data. Every server render has a
  // new `renderedAt`, and by then completed sales are included, so the layer resets.
  const baseKey = renderedAt;
  const [optimisticState, setOptimistic] = useState<Optimistic>(() => emptyOptimistic(baseKey));
  const optimistic = optimisticState.key === baseKey ? optimisticState : emptyOptimistic(baseKey);
  const bump = (itemId: string, qty: number, cents: number, method: PaymentMethod, sign: 1 | -1) =>
    setOptimistic((prev) => {
      const o = prev.key === baseKey ? prev : emptyOptimistic(baseKey);
      return {
        ...o,
        sold: { ...o.sold, [itemId]: Math.max(0, (o.sold[itemId] ?? 0) + sign * qty) },
        count: o.count + sign,
        revenue: o.revenue + sign * cents,
        cash: o.cash + (method === "cash" ? sign * cents : 0),
        digital: o.digital + (method === "cash" ? 0 : sign * cents),
      };
    });

  // Sales waiting for signal count too (they're real sales, just not sent yet).
  const queued = useMemo(() => {
    const sold: Record<string, number> = {};
    let revenue = 0;
    let cash = 0;
    for (const p of queue) {
      sold[p.itemId] = (sold[p.itemId] ?? 0) + p.quantity;
      revenue += p.priceCents;
      if (p.paymentMethod === "cash") cash += p.priceCents;
    }
    return { sold, count: queue.length, revenue, cash, digital: revenue - cash };
  }, [queue]);
  const soldLocal = useMemo(() => {
    const out: Record<string, number> = { ...optimistic.sold };
    for (const [k, v] of Object.entries(queued.sold)) out[k] = (out[k] ?? 0) + v;
    return out;
  }, [optimistic.sold, queued.sold]);

  const list = useMemo(() => {
    const avail = items
      .map((i) => ({ ...i, quantity: i.quantity - (soldLocal[i.id] ?? 0) }))
      .filter((i) => i.quantity > 0)
      .filter((i) => matches(`#${i.itemNo} ${i.name} ${i.setName} ${i.number ?? ""} ${i.language === "JP" ? "jp" : ""} ${i.condition} ${i.certNumber ?? ""} ${i.tags.join(" ")}`, dq));
    return dq ? avail : avail.sort((a, b) => (b.askingCents ?? 0) - (a.askingCents ?? 0));
  }, [items, soldLocal, dq]);

  const flush = useCallback(async () => {
    const pending = loadQueue(event.id);
    if (!pending.length || syncing) return;
    setSyncing(true);
    let remaining = [...pending];
    for (const p of pending) {
      try {
        const res = await showSellAction(p);
        remaining = remaining.filter((x) => x.clientRef !== p.clientRef);
        if (!res.ok) toast.error(`${p.name}: ${res.error}`);
      } catch (e) {
        if (isNetworkError(e)) break; // still offline; try again later
        remaining = remaining.filter((x) => x.clientRef !== p.clientRef);
      }
    }
    saveQueue(event.id, remaining);
    setSyncing(false);
    if (remaining.length < pending.length) {
      toast.success(`Synced ${pending.length - remaining.length} sale(s)`);
      router.refresh();
    }
  }, [event.id, router, syncing]);

  useEffect(() => {
    const on = () => void flush();
    window.addEventListener("online", on);
    const t = setInterval(() => {
      if (navigator.onLine && loadQueue(event.id).length) void flush();
    }, 20_000);
    return () => {
      window.removeEventListener("online", on);
      clearInterval(t);
    };
  }, [flush, event.id]);

  async function sell(item: Item, priceText: string, quantity: number, method: PaymentMethod) {
    const priceCents = parseDollars(priceText);
    if (priceCents === null || priceCents < 0) {
      toast.error("Enter a price like 35 or 35.50");
      return false;
    }
    const payload: Queued = {
      clientRef: crypto.randomUUID(),
      eventId: event.id,
      itemId: item.id,
      quantity,
      price: priceText,
      paymentMethod: method,
      name: item.name,
      priceCents,
    };
    // Optimistic: the card leaves the list and the totals move immediately.
    bump(item.id, quantity, priceCents, method, 1);
    setSelected(null);
    setQ("");
    try {
      const res = await showSellAction(payload);
      if (!res.ok) {
        bump(item.id, quantity, priceCents, method, -1); // undo the optimistic change
        toast.error(res.error);
        return false;
      }
      const saleId = res.data.id;
      toast.success(`Sold ${item.name}`, {
        description: `${formatUSD(priceCents)} · ${PAYMENT_METHODS[method]}`,
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            const u = await voidSaleAction(saleId);
            if (!u.ok) return void toast.error(u.error);
            toast.success("Sale undone — card is back");
            router.refresh();
          },
        },
      });
      router.refresh();
      return true;
    } catch (e) {
      if (!isNetworkError(e)) {
        toast.error("Couldn't save that sale. Try again.");
        return false;
      }
      bump(item.id, quantity, priceCents, method, -1); // now counted via the queue instead
      saveQueue(event.id, [...loadQueue(event.id), payload]);
      toast.warning(`No signal — ${item.name} saved on this phone and will sync automatically.`);
      return true;
    } finally {
      searchRef.current?.blur();
    }
  }

  const t = {
    count: totals.salesCount + optimistic.count + queued.count,
    revenue: totals.revenueCents + optimistic.revenue + queued.revenue,
    cash: totals.expectedCashCents + optimistic.cash + queued.cash,
    digital: totals.digitalCents + optimistic.digital + queued.digital,
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {/* Header */}
      <header className="pt-safe sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gold uppercase">
              <span className="size-2 animate-pulse rounded-full bg-profit" /> Show Mode
            </p>
            <h1 className="truncate text-lg font-bold">{event.name}</h1>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Exit Show Mode">
            <Link href={`/events/${event.id}`}>
              <X className="size-6" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-1 px-4 py-2 text-center">
          <Stat label="Sales" value={String(t.count)} />
          <Stat label="Total" value={formatUSD(t.revenue, { whole: true })} />
          <Stat label="Cash in box" value={formatUSD(t.cash, { whole: true })} gold />
          <Stat label="Digital" value={formatUSD(t.digital, { whole: true })} />
        </div>
        {queue.length ? (
          <button
            onClick={() => void flush()}
            className="flex w-full items-center justify-center gap-2 bg-warning/15 py-2 text-sm font-medium text-warning"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <CloudOff className="size-4" />}
            {queue.length} sale{queue.length === 1 ? "" : "s"} waiting for signal · tap to retry
            <RefreshCw className="size-3.5" />
          </button>
        ) : null}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search card, set, #, cert…"
              className="h-14 rounded-2xl pl-12 text-xl"
              aria-label="Search inventory"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
        </div>
      </header>

      {/* Results */}
      <main className="flex-1 px-2 pb-36">
        {list.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{q ? "No cards match." : "Nothing on hand."}</p>
        ) : (
          <ul>
            {list.slice(0, 80).map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => setSelected(i)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-accent"
                >
                  <CardThumb photoId={i.photoId} imageUrl={i.imageUrl} name={i.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg leading-tight font-semibold">{i.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {[i.setName, i.number, i.language === "JP" ? "JP" : null].filter(Boolean).join(" · ")}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant={i.condition.includes(" ") ? "default" : "outline"}>{i.condition}</Badge>
                      {i.quantity > 1 ? <Badge variant="muted">×{i.quantity}</Badge> : null}
                      {i.status === "on_hold" ? <Badge variant="warning">on hold</Badge> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xl font-bold num">{i.askingCents !== null ? formatUSD(i.askingCents, { whole: true }) : "—"}</span>
                    {i.marketCents !== null ? <span className="text-xs text-muted-foreground num">mkt {formatUSD(i.marketCents, { whole: true })}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {recent.length ? (
          <div className="mt-6 px-2">
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent sales</p>
            <ul className="space-y-1 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span className="truncate">{r.name}</span>
                  <span className="text-muted-foreground">
                    <Money cents={r.priceCents} whole /> · {PAYMENT_METHODS[r.method]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </main>

      {/* Bottom actions */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2 p-3">
          <Button variant="outline" size="xl" onClick={() => setBuyOpen(true)}>
            <PackagePlus /> Buy
          </Button>
          <Button asChild variant="outline" size="xl">
            <Link href="/trades/new">
              <ArrowLeftRight /> Trade
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <Link href={`/events/${event.id}`}>
              <FileText /> Report
            </Link>
          </Button>
        </div>
      </nav>

      {selected ? <SellSheet key={selected.id} item={selected} onClose={() => setSelected(null)} onSell={sell} cardFee={cardFee} /> : null}
      <BuySheet open={buyOpen} onOpenChange={setBuyOpen} eventId={event.id} />
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 px-1 py-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase">{label}</p>
      <p className={cn("text-base font-bold num", gold && "text-gold")}>{value}</p>
    </div>
  );
}

function SellSheet({
  item,
  onClose,
  onSell,
  cardFee,
}: {
  item: Item;
  onClose: () => void;
  onSell: (item: Item, price: string, quantity: number, method: PaymentMethod) => Promise<boolean>;
  cardFee: { bps: number; fixed: number };
}) {
  const [price, setPrice] = useState(item.askingCents !== null ? centsToInput(item.askingCents).replace(/\.00$/, "") : "");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const cents = parseDollars(price);
  const total = cents === null ? null : cents * qty;
  const fee = total !== null ? estimateFee(total, cardFee.bps, cardFee.fixed) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item.name} description={`${item.setName}${item.number ? ` · ${item.number}` : ""} · ${item.condition}`}>
        <div className="flex items-center gap-3">
          <CardThumb photoId={item.photoId} imageUrl={item.imageUrl} name={item.name} size="lg" />
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium" htmlFor="sell-price">
              Price{qty > 1 ? " each" : ""}
            </label>
            <MoneyInput
              id="sell-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-16 rounded-2xl text-3xl font-bold"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-1.5">
              {item.askingCents !== null ? (
                <Chip onClick={() => setPrice(centsToInput(item.askingCents!))}>Ask {formatUSD(item.askingCents, { whole: true })}</Chip>
              ) : null}
              {item.marketCents !== null ? (
                <Chip onClick={() => setPrice(centsToInput(item.marketCents!))}>Mkt {formatUSD(item.marketCents, { whole: true })}</Chip>
              ) : null}
              {cents !== null && cents >= 500 ? (
                <Chip onClick={() => setPrice(centsToInput(Math.floor((cents * 9) / 1000) * 100))}>−10%</Chip>
              ) : null}
            </div>
          </div>
        </div>
        {item.quantity > 1 ? (
          <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
            <span className="text-sm font-medium">Quantity (of {item.quantity})</span>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" aria-label="One fewer" onClick={() => setQty((x) => Math.max(1, x - 1))}>
                <Minus />
              </Button>
              <span className="w-6 text-center text-lg font-bold num">{qty}</span>
              <Button variant="outline" size="icon" aria-label="One more" onClick={() => setQty((x) => Math.min(item.quantity, x + 1))}>
                <Plus />
              </Button>
            </div>
          </div>
        ) : null}
        <p className="text-center text-sm text-muted-foreground">Tap how they paid to finish the sale{total !== null && qty > 1 ? ` · total ${formatUSD(total)}` : ""}</p>
        <div className="grid grid-cols-2 gap-2">
          {PAY_BUTTONS.map((m) => (
            <Button
              key={m}
              size="xl"
              variant={m === "cash" ? "default" : "secondary"}
              className={cn(m === "cash" && "col-span-2 h-20 text-xl")}
              disabled={busy || cents === null}
              onClick={async () => {
                setBusy(true);
                // Server records the total for the copies sold.
                await onSell(item, total !== null ? centsToInput(total) : price, qty, m);
                setBusy(false);
              }}
            >
              {m === "cash" ? <Banknote className="size-6" /> : null}
              {PAYMENT_METHODS[m]}
              {m === "card" && total !== null && fee ? <span className="text-xs font-normal opacity-70">−{formatUSD(fee)} fee</span> : null}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium active:bg-accent">
      {children}
    </button>
  );
}

function BuySheet({ open, onOpenChange, eventId }: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = { name: "", setName: "", number: "", language: "EN" as "EN" | "JP", condition: "NM" as RawCondition, price: "", asking: "", quantity: "1" };
  const [f, setF] = useState(blank);
  const buy = (method: PaymentMethod) =>
    start(async () => {
      const res = await showBuyAction({
        eventId,
        card: { name: f.name, setName: f.setName, setCode: null, number: f.number || null, language: f.language, rarity: null, variants: [], imageUrl: null },
        condition: { conditionType: "raw", rawCondition: f.condition, grader: null, grade: null, gradeLabel: null, certNumber: null },
        quantity: f.quantity,
        price: f.price,
        asking: f.asking,
        paymentMethod: method,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Bought ${f.name} for ${formatUSD(parseDollars(f.price) ?? 0)}`);
      setF(blank);
      onOpenChange(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Buy a card" description="Raw card bought at the table. For slabs or lots, use Buy cards in HQ.">
        <div className="grid gap-2">
          <Input aria-label="Card name" placeholder="Card name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-12 text-lg" />
          <div className="grid grid-cols-[1fr_6rem_4.5rem] gap-2">
            <Input aria-label="Set" placeholder="Set" value={f.setName} onChange={(e) => setF({ ...f, setName: e.target.value })} />
            <Input aria-label="Number" placeholder="No." value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
            <button
              type="button"
              className="rounded-lg border bg-card text-sm font-semibold"
              onClick={() => setF({ ...f, language: f.language === "EN" ? "JP" : "EN" })}
              aria-label="Language"
            >
              {f.language}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Condition">
            {(Object.keys(RAW_CONDITIONS) as RawCondition[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.condition === c}
                onClick={() => setF({ ...f, condition: c })}
                className={cn("rounded-lg border py-2.5 text-sm font-semibold", f.condition === c ? "border-primary bg-primary/15 text-gold" : "bg-card text-muted-foreground")}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
            <MoneyInput aria-label="Price paid" placeholder="Paid" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="h-12 text-lg" />
            <MoneyInput aria-label="Asking price" placeholder="Ask" value={f.asking} onChange={(e) => setF({ ...f, asking: e.target.value })} className="h-12 text-lg" />
            <Input aria-label="Quantity" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="h-12 text-center text-lg" />
          </div>
          <p className="text-center text-sm text-muted-foreground">Tap how you paid</p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_BUTTONS.filter((m) => m !== "card").map((m) => (
              <Button
                key={m}
                size="lg"
                variant={m === "cash" ? "default" : "secondary"}
                className={cn(m === "cash" && "col-span-2 h-14 text-lg")}
                disabled={pending || !f.name.trim() || !f.setName.trim() || parseDollars(f.price) === null}
                onClick={() => buy(m)}
              >
                {pending && m === "cash" ? <Loader2 className="animate-spin" /> : null}
                {PAYMENT_METHODS[m]}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
