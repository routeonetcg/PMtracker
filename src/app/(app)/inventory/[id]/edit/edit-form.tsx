"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type AskingDraft,
  AskingFields,
  type CardDraft,
  CardFields,
  type ConditionDraft,
  ConditionFields,
  cardPayload,
  conditionPayload,
} from "@/components/card-fields";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { EDITABLE_STATUSES, keys, LOCATIONS, type Location, STATUSES } from "@/lib/labels";
import { askingFromMarkup, bpsToInput, centsToInput, formatUSD, parseDollars, parsePercentToBps } from "@/lib/money";
import { itemEditSchema } from "@/lib/validation";
import type { InventoryRow } from "@/server/inventory";
import type { FormLookups } from "@/server/lookups";
import { updateItem } from "../../actions";

export function EditItemForm({ item, lookups }: { item: InventoryRow; lookups: FormLookups }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { check, err, first, setErrors } = useFormErrors(itemEditSchema);
  const closed = item.status === "sold" || item.status === "traded";

  const [card, setCard] = useState<CardDraft>({
    name: item.card.name,
    setName: item.card.setName,
    setCode: item.card.setCode ?? "",
    number: item.card.number ?? "",
    language: item.card.language,
    rarity: item.card.rarity ?? "",
    variants: item.card.variants,
    imageUrl: item.card.imageUrl ?? "",
  });
  const [condition, setCondition] = useState<ConditionDraft>({
    conditionType: item.conditionType,
    rawCondition: item.rawCondition ?? "NM",
    grader: item.grader ?? "",
    grade: item.grade ? String(Number(item.grade)) : "",
    gradeLabel: item.gradeLabel ?? "",
    certNumber: item.certNumber ?? "",
  });
  const [details, setDetails] = useState({
    quantity: String(item.quantity),
    status: (EDITABLE_STATUSES as string[]).includes(item.status) ? item.status : "in_stock",
    location: item.location as Location,
    holderId: item.holderId ?? "",
    tags: item.tags.join(", "),
    notes: item.notes ?? "",
  });
  const [cost, setCost] = useState({
    purchase: centsToInput(item.purchaseCents),
    fees: centsToInput(item.feesCents),
    shipping: centsToInput(item.shippingCents),
    grading: centsToInput(item.gradingCents),
  });
  const [asking, setAsking] = useState<AskingDraft>({
    askingMode: item.askingMode,
    asking: centsToInput(item.askingCents),
    markupPct: item.markupBps !== null ? bpsToInput(item.markupBps) : "15",
  });
  const [market, setMarket] = useState({ market: centsToInput(item.marketCents), marketSource: item.marketSource ?? "" });
  const [acquiredOn, setAcquiredOn] = useState(item.acquiredOn);

  const mkt = parseDollars(market.market);
  const mu = parsePercentToBps(asking.markupPct);
  const preview = mkt !== null && mu !== null ? formatUSD(askingFromMarkup(mkt, mu, 100)) : null;
  const totalCost = ["purchase", "fees", "shipping", "grading"].reduce((a, k) => a + (parseDollars(cost[k as keyof typeof cost]) ?? 0), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      id: item.id,
      card: cardPayload(card),
      condition: conditionPayload(condition),
      details: { ...details, tags: details.tags.split(",").map((t) => t.trim()).filter(Boolean) },
      cost,
      asking,
      market,
      acquiredOn,
    };
    if (!check(payload)) return void toast.error("Check the highlighted fields");
    start(async () => {
      const res = await updateItem(payload);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return void toast.error(res.error);
      }
      toast.success("Saved");
      router.push(`/inventory/${item.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardFields value={card} onChange={setCard} err={err} prefix="card" known={lookups.knownCards} idPrefix="e" />
          <p className="text-xs text-muted-foreground">Name/set changes apply to every copy of this card.</p>
          <ConditionFields value={condition} onChange={setCondition} err={err} prefix="condition" idPrefix="e" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost basis</CardTitle>
          <span className="text-sm font-semibold num">{formatUSD(totalCost)}</span>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Purchase" htmlFor="purchase" error={err("cost.purchase")} hint="Total for this row">
            <MoneyInput id="purchase" value={cost.purchase} onChange={(e) => setCost({ ...cost, purchase: e.target.value })} />
          </Field>
          <Field label="Fees" htmlFor="cfees" error={err("cost.fees")}>
            <MoneyInput id="cfees" value={cost.fees} onChange={(e) => setCost({ ...cost, fees: e.target.value })} />
          </Field>
          <Field label="Shipping" htmlFor="cship" error={err("cost.shipping")}>
            <MoneyInput id="cship" value={cost.shipping} onChange={(e) => setCost({ ...cost, shipping: e.target.value })} />
          </Field>
          <Field label="Grading" htmlFor="cgrade" error={err("cost.grading")}>
            <MoneyInput id="cgrade" value={cost.grading} onChange={(e) => setCost({ ...cost, grading: e.target.value })} />
          </Field>
          <Field label="Acquired on" htmlFor="acq" error={err("acquiredOn")} className="col-span-2">
            <Input id="acq" type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3">
            <Field label="Market price (each)" htmlFor="market" error={err("market.market")}>
              <MoneyInput id="market" value={market.market} onChange={(e) => setMarket({ ...market, market: e.target.value })} />
            </Field>
            <Field label="Market source" htmlFor="msrc">
              <Input id="msrc" value={market.marketSource} onChange={(e) => setMarket({ ...market, marketSource: e.target.value })} placeholder="Manual" />
            </Field>
          </div>
          <AskingFields value={asking} onChange={setAsking} err={err} prefix="asking" idPrefix="e" previewCents={preview} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="qty" error={err("details.quantity")}>
            <Input id="qty" inputMode="numeric" value={details.quantity} disabled={closed} onChange={(e) => setDetails({ ...details, quantity: e.target.value })} />
          </Field>
          <Field label="Status" htmlFor="status" hint={closed ? "Undo the sale/trade to change" : undefined}>
            <Select id="status" value={details.status} disabled={closed} onChange={(e) => setDetails({ ...details, status: e.target.value as typeof details.status })}>
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUSES[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="loc">
            <Select id="loc" value={details.location} onChange={(e) => setDetails({ ...details, location: e.target.value as Location })}>
              {keys(LOCATIONS).map((l) => (
                <option key={l} value={l}>
                  {LOCATIONS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Held by" htmlFor="holder">
            <Select id="holder" value={details.holderId} onChange={(e) => setDetails({ ...details, holderId: e.target.value })}>
              {lookups.holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Comma separated" className="col-span-2">
            <Input id="tags" value={details.tags} onChange={(e) => setDetails({ ...details, tags: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="col-span-2">
            <Textarea id="notes" value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      {first ? <p className="text-sm text-destructive" role="alert">{first}</p> : null}
      <div className="sticky bottom-20 z-10 flex gap-2 md:bottom-4">
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-1 shadow-xl" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save changes
        </Button>
      </div>
    </form>
  );
}
