"use client";

import { ChevronDown, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AskingFields,
  type AskingDraft,
  type CardDraft,
  CardFields,
  type ConditionDraft,
  ConditionFields,
  cardPayload,
  conditionPayload,
  emptyAsking,
  emptyCard,
  emptyCondition,
} from "@/components/card-fields";
import { Money } from "@/components/display";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form-controls";
import { Card, CardContent } from "@/components/ui/misc";
import { CHANNELS, keys, LOCATIONS, type Location } from "@/lib/labels";
import { parseDollars, parsePercentToBps, splitLot, conditionLabelSafe } from "./split-preview";
import { purchaseSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { FormLookups } from "@/server/lookups";
import { createPurchaseAction } from "./actions";

type Line = {
  key: number;
  open: boolean;
  card: CardDraft;
  condition: ConditionDraft;
  quantity: string;
  sharePct: string;
  unitMarket: string;
  manualPrice: string;
  asking: AskingDraft;
  location: Location;
  tags: string;
  notes: string;
};

type SplitMethod = "percent" | "market_value" | "manual" | "even";
const SPLITS: Record<SplitMethod, string> = {
  market_value: "By market value",
  percent: "By percentage",
  even: "Evenly (per card)",
  manual: "Enter each price",
};

const newLine = (markup: string, key: number): Line => ({
  key,
  open: true,
  card: emptyCard(),
  condition: emptyCondition(),
  quantity: "1",
  sharePct: "",
  unitMarket: "",
  manualPrice: "",
  asking: emptyAsking(markup),
  location: "binder",
  tags: "",
  notes: "",
});

export function BuyForm({
  lookups,
  today,
  defaultMarkupPct,
  initialMode,
}: {
  lookups: FormLookups;
  today: string;
  defaultMarkupPct: string;
  initialMode: "single" | "lot";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"single" | "lot">(initialMode);
  const [head, setHead] = useState({
    acquiredOn: today,
    source: "",
    channel: "" as "" | keyof typeof CHANNELS,
    eventId: "",
    paidByHolderId: lookups.myHolderId ?? "",
    holderId: lookups.myHolderId ?? "",
    price: "",
    fees: "",
    shipping: "",
    splitMethod: "market_value" as SplitMethod,
    notes: "",
  });
  // Deterministic keys so server and client render the same ids.
  const keyRef = useRef(10);
  const nextKey = () => ++keyRef.current;
  const [lines, setLines] = useState<Line[]>(() => (initialMode === "lot" ? [newLine(defaultMarkupPct, 1), newLine(defaultMarkupPct, 2)] : [newLine(defaultMarkupPct, 1)]));
  const { check, err, first, setErrors } = useFormErrors(purchaseSchema);

  const lot = mode === "lot";
  const activeLines = lot ? lines : lines.slice(0, 1);

  const payload = () => ({
    ...head,
    channel: head.channel || null,
    splitMethod: lot ? head.splitMethod : "even",
    lines: activeLines.map((l) => ({
      card: cardPayload(l.card),
      condition: conditionPayload(l.condition),
      quantity: l.quantity,
      sharePct: l.sharePct,
      unitMarket: l.unitMarket,
      manualPrice: l.manualPrice,
      asking: l.asking,
      location: l.location,
      tags: l.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: l.notes,
    })),
  });

  // Live preview of how the lot price is split (same math as the server).
  const preview = useMemo(() => {
    const price = parseDollars(head.price);
    if (price === null || !lot) return null;
    try {
      return splitLot({
        priceCents: price,
        feesCents: parseDollars(head.fees) ?? 0,
        shippingCents: parseDollars(head.shipping) ?? 0,
        method: head.splitMethod,
        lines: activeLines.map((l) => ({
          quantity: Math.max(1, Number(l.quantity) || 1),
          shareBps: parsePercentToBps(l.sharePct) ?? 0,
          unitMarketCents: parseDollars(l.unitMarket) ?? undefined,
          manualCents: parseDollars(l.manualPrice) ?? undefined,
        })),
      });
    } catch (e) {
      return e instanceof Error ? e.message : "Can't split yet";
    }
  }, [head, activeLines, lot]);

  const shareTotal = activeLines.reduce((a, l) => a + (parsePercentToBps(l.sharePct) ?? 0), 0);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = payload();
    if (!check(p)) {
      setLines((ls) => ls.map((l) => ({ ...l, open: true })));
      toast.error("Check the highlighted fields");
      return;
    }
    start(async () => {
      const res = await createPurchaseAction(p);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
        return;
      }
      const n = res.data.itemIds.length;
      toast.success(n === 1 ? "Card added to inventory" : `${n} cards added to inventory`);
      router.push(n === 1 ? `/inventory/${res.data.itemIds[0]}` : "/inventory");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="What are you adding?">
        {(["single", "lot"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              if (m === "lot" && lines.length < 2) {
                const key = nextKey();
                setLines((ls) => [...ls, newLine(defaultMarkupPct, key)]);
              }
            }}
            className={cn("rounded-lg py-2.5 text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {m === "single" ? "One card" : "Bulk lot (one price)"}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <Field label="Date bought" htmlFor="acquiredOn" error={err("acquiredOn")}>
            <Input id="acquiredOn" type="date" value={head.acquiredOn} onChange={(e) => setHead({ ...head, acquiredOn: e.target.value })} />
          </Field>
          <Field label="Bought from" htmlFor="source" hint="Seller, shop or show">
            <Input id="source" value={head.source} onChange={(e) => setHead({ ...head, source: e.target.value })} placeholder="@seller on Instagram" />
          </Field>
          <Field label={lot ? "Total lot price" : "Price paid"} htmlFor="price" error={err("price")} hint="Leave blank if you'll fill it in later">
            <MoneyInput id="price" value={head.price} onChange={(e) => setHead({ ...head, price: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fees" htmlFor="fees" error={err("fees")}>
              <MoneyInput id="fees" value={head.fees} onChange={(e) => setHead({ ...head, fees: e.target.value })} />
            </Field>
            <Field label="Shipping" htmlFor="shipping" error={err("shipping")}>
              <MoneyInput id="shipping" value={head.shipping} onChange={(e) => setHead({ ...head, shipping: e.target.value })} />
            </Field>
          </div>
          <Field label="Paid by" htmlFor="paidBy">
            <Select id="paidBy" value={head.paidByHolderId} onChange={(e) => setHead({ ...head, paidByHolderId: e.target.value, holderId: e.target.value })}>
              {lookups.holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Where" htmlFor="channel">
            <Select id="channel" value={head.channel} onChange={(e) => setHead({ ...head, channel: e.target.value as typeof head.channel })}>
              <option value="">—</option>
              {keys(CHANNELS).map((c) => (
                <option key={c} value={c}>
                  {CHANNELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          {lookups.events.length ? (
            <Field label="At event" htmlFor="eventId">
              <Select id="eventId" value={head.eventId} onChange={(e) => setHead({ ...head, eventId: e.target.value })}>
                <option value="">None</option>
                {lookups.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({ev.startsOn})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {lot ? (
            <Field label="Split the cost" htmlFor="split">
              <Select id="split" value={head.splitMethod} onChange={(e) => setHead({ ...head, splitMethod: e.target.value as SplitMethod })}>
                {keys(SPLITS).map((s) => (
                  <option key={s} value={s}>
                    {SPLITS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </CardContent>
      </Card>

      {err("lines") ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err("lines")}</p> : null}

      <div className="space-y-3">
        {activeLines.map((l, i) => {
          const p = `lines.${i}`;
          const alloc = Array.isArray(preview) ? preview[i] : null;
          return (
            <Card key={l.key} className={cn(lot && "border-l-4 border-l-primary/60")}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => update(l.key, { open: !l.open })}
                aria-expanded={l.open}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {lot ? `${i + 1}. ` : ""}
                    {l.card.name || "New card"}
                    {Number(l.quantity) > 1 ? ` ×${l.quantity}` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[l.card.setName, l.card.number, conditionLabelSafe(l.condition)].filter(Boolean).join(" · ") || "Tap to fill in"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {alloc ? (
                    <span className="text-right text-sm">
                      <Money cents={(alloc.purchaseCents ?? 0) + alloc.feesCents + alloc.shippingCents} className="font-semibold" />
                      <span className="block text-[11px] text-muted-foreground">cost</span>
                    </span>
                  ) : null}
                  <ChevronDown className={cn("size-4 transition-transform", l.open && "rotate-180")} />
                </span>
              </button>
              {l.open ? (
                <CardContent className="space-y-4 border-t pt-4">
                  <CardFields value={l.card} onChange={(card) => update(l.key, { card })} err={err} prefix={`${p}.card`} known={lookups.knownCards} idPrefix={`l${l.key}`} />
                  <ConditionFields value={l.condition} onChange={(condition) => update(l.key, { condition })} err={err} prefix={`${p}.condition`} idPrefix={`l${l.key}`} />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Quantity" htmlFor={`l${l.key}-qty`} error={err(`${p}.quantity`)}>
                      <Input id={`l${l.key}-qty`} inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                    </Field>
                    <Field label="Market (each)" htmlFor={`l${l.key}-mkt`} error={err(`${p}.unitMarket`)}>
                      <MoneyInput id={`l${l.key}-mkt`} value={l.unitMarket} onChange={(e) => update(l.key, { unitMarket: e.target.value })} />
                    </Field>
                    {lot && head.splitMethod === "percent" ? (
                      <Field label="Share %" htmlFor={`l${l.key}-share`} error={err(`${p}.sharePct`)}>
                        <Input id={`l${l.key}-share`} inputMode="decimal" value={l.sharePct} onChange={(e) => update(l.key, { sharePct: e.target.value })} placeholder="25" />
                      </Field>
                    ) : null}
                    {lot && head.splitMethod === "manual" ? (
                      <Field label="This card's price" htmlFor={`l${l.key}-manual`} error={err(`${p}.manualPrice`)}>
                        <MoneyInput id={`l${l.key}-manual`} value={l.manualPrice} onChange={(e) => update(l.key, { manualPrice: e.target.value })} />
                      </Field>
                    ) : null}
                    <Field label="Location" htmlFor={`l${l.key}-loc`}>
                      <Select id={`l${l.key}-loc`} value={l.location} onChange={(e) => update(l.key, { location: e.target.value as Location })}>
                        {keys(LOCATIONS).map((x) => (
                          <option key={x} value={x}>
                            {LOCATIONS[x]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <AskingFields value={l.asking} onChange={(asking) => update(l.key, { asking })} err={err} prefix={`${p}.asking`} idPrefix={`l${l.key}`} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Tags" htmlFor={`l${l.key}-tags`} hint="Comma separated">
                      <Input id={`l${l.key}-tags`} value={l.tags} onChange={(e) => update(l.key, { tags: e.target.value })} placeholder="chase, vintage" />
                    </Field>
                    <Field label="Notes" htmlFor={`l${l.key}-notes`}>
                      <Input id={`l${l.key}-notes`} value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} />
                    </Field>
                  </div>
                  {lot ? (
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                          const key = nextKey();
                          setLines((ls) => [...ls, { ...l, key, card: { ...l.card }, condition: { ...l.condition } }]);
                        }}>
                        <Copy /> Duplicate
                      </Button>
                      {lines.length > 1 ? (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash2 /> Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>

      {lot ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => {
              const key = nextKey();
              setLines((ls) => [...ls.map((x) => ({ ...x, open: false })), newLine(defaultMarkupPct, key)]);
            }}>
            <Plus /> Add another card
          </Button>
          {head.splitMethod === "percent" ? (
            <span className={cn("text-sm num", shareTotal === 10000 ? "text-profit" : "text-warning")}>Shares: {shareTotal / 100}% of 100%</span>
          ) : null}
          {typeof preview === "string" && head.price ? <span className="text-sm text-warning">{preview}</span> : null}
        </div>
      ) : null}

      <Field label="Notes about this purchase" htmlFor="notes">
        <Textarea id="notes" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} rows={2} />
      </Field>

      {first ? <p className="text-sm text-destructive" role="alert">{first}</p> : null}

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <Button type="submit" size="lg" className="w-full shadow-xl" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {lot ? `Add ${activeLines.length} cards` : "Add card"}
        </Button>
      </div>
    </form>
  );
}
