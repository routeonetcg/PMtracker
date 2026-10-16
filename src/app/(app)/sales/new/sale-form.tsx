"use client";

import { Calculator, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CardThumb, cardSubtitle, Money } from "@/components/display";
import { ItemPicker } from "@/components/item-picker";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form-controls";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/misc";
import { CHANNELS, conditionLabel, keys, PAYMENT_METHODS, type Channel, type PaymentMethod } from "@/lib/labels";
import { centsToInput, computeSale, estimateFee, formatUSD, mulDivRound, parseDollars } from "@/lib/money";
import { saleSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/server/inventory";
import type { FormLookups } from "@/server/lookups";
import { createSaleAction } from "../actions";

type Line = { item: InventoryRow; quantity: string; manualPrice: string };

export function SaleForm({
  items,
  lookups,
  today,
  preselect,
  ebayFee,
}: {
  items: InventoryRow[];
  lookups: FormLookups;
  today: string;
  preselect?: string;
  ebayFee: { bps: number; fixed: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const initial = items.find((i) => i.id === preselect);
  const [lines, setLines] = useState<Line[]>(initial ? [{ item: initial, quantity: "1", manualPrice: "" }] : []);
  const [priceTouched, setPriceTouched] = useState(false);
  const [f, setF] = useState({
    soldOn: today,
    channel: "card_show" as Channel,
    eventId: lookups.events.find((e) => e.status === "live")?.id ?? "",
    price: initial?.effectiveAskingCents != null ? centsToInput(initial.effectiveAskingCents) : "",
    platformFees: "",
    shippingCost: "",
    paymentMethod: "cash" as PaymentMethod,
    soldByPartnerId: lookups.meId ?? "",
    receivedByHolderId: lookups.myHolderId ?? "",
    split: "weight" as "weight" | "manual" | "even",
    buyerNote: "",
  });
  const { check, err, first, setErrors } = useFormErrors(saleSchema);

  const askingTotal = lines.reduce((a, l) => a + (l.item.effectiveAskingCents ?? 0) * (Number(l.quantity) || 1), 0);

  function setLinesAndPrice(next: Line[]) {
    setLines(next);
    if (!priceTouched) {
      const total = next.reduce((a, l) => a + (l.item.effectiveAskingCents ?? 0) * (Number(l.quantity) || 1), 0);
      setF((p) => ({ ...p, price: total ? centsToInput(total) : "" }));
    }
  }

  const preview = useMemo(() => {
    const price = parseDollars(f.price);
    if (price === null || !lines.length) return null;
    try {
      return computeSale({
        priceCents: price,
        platformFeesCents: parseDollars(f.platformFees) ?? 0,
        shippingCostCents: parseDollars(f.shippingCost) ?? 0,
        split: f.split,
        lines: lines.map((l) => {
          const q = Math.min(Math.max(1, Number(l.quantity) || 1), l.item.quantity);
          // Approximate cost share for a partial quantity (server splits exactly).
          const cost = mulDivRound(l.item.costBasisCents, q, l.item.quantity);
          return {
            costBasisCents: cost,
            weightCents: (l.item.marketCents ?? l.item.effectiveAskingCents ?? 0) * q,
            manualPriceCents: parseDollars(l.manualPrice) ?? undefined,
          };
        }),
      });
    } catch {
      return null;
    }
  }, [f, lines]);

  const payload = () => ({
    ...f,
    lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity, manualPrice: l.manualPrice })),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = payload();
    if (!check(p)) return void toast.error("Check the highlighted fields");
    start(async () => {
      const res = await createSaleAction(p);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return void toast.error(res.error);
      }
      toast.success(`Sale #${res.data.saleNo} saved`, {
        description: `Profit ${formatUSD(res.data.profitCents, { signed: true })}`,
      });
      router.push("/sales");
      router.refresh();
    });
  }

  const missingCost = lines.some((l) => l.item.costMissing);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* Cards */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          {lines.length === 0 ? (
            <EmptyState title="Which card sold?" className="py-8" action={<Button type="button" onClick={() => setPickerOpen(true)}><Plus /> Pick a card</Button>}>
              Search your inventory. Add more than one card for a bundle.
            </EmptyState>
          ) : (
            <>
              <ul className="divide-y">
                {lines.map((l, i) => (
                  <li key={l.item.id} className="flex items-center gap-3 py-2.5">
                    <CardThumb photoId={l.item.photoId} imageUrl={l.item.card.imageUrl} name={l.item.card.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.item.card.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{cardSubtitle(l.item.card)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{conditionLabel(l.item)}</Badge>
                        {l.item.costMissing ? <Badge variant="warning">cost missing</Badge> : null}
                        {preview && lines.length > 1 ? (
                          <span className="text-xs text-muted-foreground">
                            share <Money cents={preview.lines[i]?.priceCents} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {l.item.quantity > 1 ? (
                      <Field label={`of ${l.item.quantity}`} className="w-16">
                        <Input
                          inputMode="numeric"
                          aria-label="Quantity"
                          value={l.quantity}
                          onChange={(e) => setLinesAndPrice(lines.map((x) => (x.item.id === l.item.id ? { ...x, quantity: e.target.value } : x)))}
                        />
                      </Field>
                    ) : null}
                    {lines.length > 1 && f.split === "manual" ? (
                      <MoneyInput aria-label="Line price" className="w-28" value={l.manualPrice} onChange={(e) => setLines(lines.map((x) => (x.item.id === l.item.id ? { ...x, manualPrice: e.target.value } : x)))} />
                    ) : (
                      <Money cents={l.item.effectiveAskingCents} className="text-sm text-muted-foreground" />
                    )}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setLinesAndPrice(lines.filter((x) => x.item.id !== l.item.id))}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus /> Add card (bundle)
                </Button>
                {lines.length > 1 ? (
                  <Select aria-label="Split bundle price" className="h-8 w-auto text-xs" value={f.split} onChange={(e) => setF({ ...f, split: e.target.value as typeof f.split })}>
                    <option value="weight">Split by market value</option>
                    <option value="even">Split evenly</option>
                    <option value="manual">Enter each price</option>
                  </Select>
                ) : null}
              </div>
            </>
          )}
          {err("lines") ? <p className="text-sm text-destructive">{err("lines")}</p> : null}
        </CardContent>
      </Card>

      {/* Money */}
      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <Field label="Sale price" htmlFor="price" error={err("price")} hint={askingTotal ? <>Asking total <Money cents={askingTotal} /></> : undefined} className="sm:col-span-1">
            <MoneyInput
              id="price"
              className="h-12 text-lg font-semibold"
              value={f.price}
              onChange={(e) => {
                setPriceTouched(true);
                setF({ ...f, price: e.target.value });
              }}
            />
          </Field>
          <Field label="Platform fees" htmlFor="fees" error={err("platformFees")}>
            <div className="flex gap-1">
              <MoneyInput id="fees" value={f.platformFees} onChange={(e) => setF({ ...f, platformFees: e.target.value })} />
              {f.channel === "ebay" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Estimate eBay fees"
                  aria-label="Estimate eBay fees"
                  onClick={() => setF({ ...f, platformFees: centsToInput(estimateFee(parseDollars(f.price) ?? 0, ebayFee.bps, ebayFee.fixed)) })}
                >
                  <Calculator />
                </Button>
              ) : null}
            </div>
          </Field>
          <Field label="Shipping cost" htmlFor="ship" error={err("shippingCost")}>
            <MoneyInput id="ship" value={f.shippingCost} onChange={(e) => setF({ ...f, shippingCost: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      {/* Channel & payment */}
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Channel</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {keys(CHANNELS).map((c) => (
                <Chip key={c} on={f.channel === c} onClick={() => setF({ ...f, channel: c })}>
                  {CHANNELS[c]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Payment</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {keys(PAYMENT_METHODS).map((m) => (
                <Chip key={m} on={f.paymentMethod === m} onClick={() => setF({ ...f, paymentMethod: m })}>
                  {PAYMENT_METHODS[m]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="soldOn" error={err("soldOn")}>
              <Input id="soldOn" type="date" value={f.soldOn} onChange={(e) => setF({ ...f, soldOn: e.target.value })} />
            </Field>
            <Field label="Sold by" htmlFor="soldBy" error={err("soldByPartnerId")}>
              <Select id="soldBy" value={f.soldByPartnerId} onChange={(e) => setF({ ...f, soldByPartnerId: e.target.value })}>
                {lookups.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Money went to" htmlFor="recv" hint="Who's holding this payment">
              <Select id="recv" value={f.receivedByHolderId} onChange={(e) => setF({ ...f, receivedByHolderId: e.target.value })}>
                {lookups.holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Event" htmlFor="event">
              <Select id="event" value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}>
                <option value="">None</option>
                {lookups.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({ev.startsOn})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Buyer note" htmlFor="buyer" className="sm:col-span-2">
              <Textarea id="buyer" rows={2} value={f.buyerNote} onChange={(e) => setF({ ...f, buyerNote: e.target.value })} placeholder="@handle, phone, or anything to remember" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Profit summary */}
      {preview ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Net to us</p>
            <Money cents={preview.netProceedsCents} className="font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cost</p>
            <Money cents={preview.costBasisCents} className="font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit</p>
            <Money cents={preview.profitCents} pl className="text-lg font-bold" />
          </div>
          {missingCost ? <p className="col-span-3 text-xs text-warning">Some cards have no cost yet, so profit is overstated until you add it.</p> : null}
        </div>
      ) : null}

      {first ? <p className="text-sm text-destructive" role="alert">{first}</p> : null}

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <Button type="submit" size="lg" className="w-full shadow-xl" disabled={pending || lines.length === 0}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {lines.length > 1 ? `Record bundle of ${lines.length}` : "Record sale"}
        </Button>
      </div>

      <ItemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        items={items}
        exclude={lines.map((l) => l.item.id)}
        onPick={(item) => setLinesAndPrice([...lines, { item, quantity: "1", manualPrice: "" }])}
      />
    </form>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-lg border py-2.5 text-sm font-semibold transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
