"use client";

import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
  emptyAsking,
  emptyCard,
  emptyCondition,
} from "@/components/card-fields";
import { CardThumb, cardSubtitle, Money } from "@/components/display";
import { ItemPicker } from "@/components/item-picker";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { CHANNELS, keys, LOCATIONS, type Channel, type Location } from "@/lib/labels";
import { centsToInput, computeTrade, mulDivRound, parseDollars } from "@/lib/money";
import { tradeSchema } from "@/lib/validation";
import type { InventoryRow } from "@/server/inventory";
import type { FormLookups } from "@/server/lookups";
import { createTradeAction } from "../actions";

type OutLine = { item: InventoryRow; quantity: string; agreedValue: string };
type InLine = {
  key: number;
  card: CardDraft;
  condition: ConditionDraft;
  quantity: string;
  agreedValue: string;
  unitMarket: string;
  location: Location;
  asking: AskingDraft;
};
let k = 1;

export function TradeForm({ items, lookups, today, defaultMarkupPct }: { items: InventoryRow[]; lookups: FormLookups; today: string; defaultMarkupPct: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picker, setPicker] = useState(false);
  const [out, setOut] = useState<OutLine[]>([]);
  const [ins, setIns] = useState<InLine[]>([]);
  const [f, setF] = useState({
    tradedOn: today,
    channel: "card_show" as Channel,
    eventId: lookups.events.find((e) => e.status === "live")?.id ?? "",
    partnerId: lookups.meId ?? "",
    holderId: lookups.myHolderId ?? "",
    cashIn: "",
    cashOut: "",
    paymentMethod: "cash" as const,
    counterparty: "",
    notes: "",
  });
  const { check, err, first, setErrors } = useFormErrors(tradeSchema);

  const addIn = () =>
    setIns((x) => [
      ...x,
      { key: k++, card: emptyCard(), condition: emptyCondition(), quantity: "1", agreedValue: "", unitMarket: "", location: "binder", asking: emptyAsking(defaultMarkupPct) },
    ]);

  const summary = useMemo(() => {
    try {
      return computeTrade({
        out: out.map((o) => {
          const q = Math.min(Math.max(1, Number(o.quantity) || 1), o.item.quantity);
          return { agreedValueCents: parseDollars(o.agreedValue) ?? 0, costBasisCents: mulDivRound(o.item.costBasisCents, q, o.item.quantity) };
        }),
        in: ins.map((i) => ({ agreedValueCents: parseDollars(i.agreedValue) ?? 0 })),
        cashInCents: parseDollars(f.cashIn) ?? 0,
        cashOutCents: parseDollars(f.cashOut) ?? 0,
      });
    } catch {
      return null;
    }
  }, [out, ins, f.cashIn, f.cashOut]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...f,
      out: out.map((o) => ({ itemId: o.item.id, quantity: o.quantity, agreedValue: o.agreedValue })),
      in: ins.map((i) => ({
        card: cardPayload(i.card),
        condition: conditionPayload(i.condition),
        quantity: i.quantity,
        agreedValue: i.agreedValue,
        location: i.location,
        asking: i.asking,
        unitMarket: i.unitMarket,
      })),
    };
    if (!check(payload)) return void toast.error("Check the highlighted fields");
    start(async () => {
      const res = await createTradeAction(payload);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return void toast.error(res.error);
      }
      toast.success(`Trade #${res.data.tradeNo} saved`);
      router.push("/trades");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <ArrowUpRight className="size-4 text-loss" /> Cards going out
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent>
          {out.length === 0 ? <p className="text-sm text-muted-foreground">None yet — tap Add to pick from inventory.</p> : null}
          <ul className="divide-y">
            {out.map((o, i) => (
              <li key={o.item.id} className="flex items-center gap-3 py-2.5">
                <CardThumb photoId={o.item.photoId} imageUrl={o.item.card.imageUrl} name={o.item.card.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.item.card.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {cardSubtitle(o.item.card)} · cost <Money cents={o.item.costBasisCents} />
                  </p>
                </div>
                {o.item.quantity > 1 ? (
                  <Input aria-label="Quantity" inputMode="numeric" className="w-14" value={o.quantity} onChange={(e) => setOut(out.map((x) => (x.item.id === o.item.id ? { ...x, quantity: e.target.value } : x)))} />
                ) : null}
                <div className="w-28">
                  <MoneyInput aria-label="Agreed value" aria-invalid={!!err(`out.${i}.agreedValue`)} value={o.agreedValue} onChange={(e) => setOut(out.map((x) => (x.item.id === o.item.id ? { ...x, agreedValue: e.target.value } : x)))} />
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setOut(out.filter((x) => x.item.id !== o.item.id))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <Field label="Cash we paid" htmlFor="cashOut" className="mt-3 max-w-48" error={err("cashOut")}>
            <MoneyInput id="cashOut" value={f.cashOut} onChange={(e) => setF({ ...f, cashOut: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <ArrowDownLeft className="size-4 text-profit" /> Cards coming in
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addIn}>
            <Plus /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ins.length === 0 ? <p className="text-sm text-muted-foreground">None yet — tap Add to enter a card you received.</p> : null}
          {ins.map((l, i) => {
            const p = `in.${i}`;
            const upd = (patch: Partial<InLine>) => setIns(ins.map((x) => (x.key === l.key ? { ...x, ...patch } : x)));
            return (
              <div key={l.key} className="space-y-3 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Card {i + 1}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {summary?.inCostCents[i] !== undefined ? (
                      <>
                        cost basis <Money cents={summary.inCostCents[i]} className="font-semibold text-foreground" />
                      </>
                    ) : null}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove card" onClick={() => setIns(ins.filter((x) => x.key !== l.key))}>
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                <CardFields value={l.card} onChange={(card) => upd({ card })} err={err} prefix={`${p}.card`} known={lookups.knownCards} idPrefix={`t${l.key}`} />
                <ConditionFields value={l.condition} onChange={(condition) => upd({ condition })} err={err} prefix={`${p}.condition`} idPrefix={`t${l.key}`} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Agreed value" htmlFor={`t${l.key}-val`} error={err(`${p}.agreedValue`)}>
                    <MoneyInput id={`t${l.key}-val`} value={l.agreedValue} onChange={(e) => upd({ agreedValue: e.target.value })} />
                  </Field>
                  <Field label="Qty" htmlFor={`t${l.key}-qty`} error={err(`${p}.quantity`)}>
                    <Input id={`t${l.key}-qty`} inputMode="numeric" value={l.quantity} onChange={(e) => upd({ quantity: e.target.value })} />
                  </Field>
                  <Field label="Market (each)" htmlFor={`t${l.key}-mkt`}>
                    <MoneyInput id={`t${l.key}-mkt`} value={l.unitMarket} onChange={(e) => upd({ unitMarket: e.target.value })} />
                  </Field>
                  <Field label="Location" htmlFor={`t${l.key}-loc`}>
                    <Select id={`t${l.key}-loc`} value={l.location} onChange={(e) => upd({ location: e.target.value as Location })}>
                      {keys(LOCATIONS).map((x) => (
                        <option key={x} value={x}>
                          {LOCATIONS[x]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <AskingFields value={l.asking} onChange={(asking) => upd({ asking })} err={err} prefix={`${p}.asking`} idPrefix={`t${l.key}`} />
              </div>
            );
          })}
          <Field label="Cash we received" htmlFor="cashIn" className="max-w-48" error={err("cashIn")}>
            <MoneyInput id="cashIn" value={f.cashIn} onChange={(e) => setF({ ...f, cashIn: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="tradedOn" error={err("tradedOn")}>
            <Input id="tradedOn" type="date" value={f.tradedOn} onChange={(e) => setF({ ...f, tradedOn: e.target.value })} />
          </Field>
          <Field label="Channel" htmlFor="channel">
            <Select id="channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as Channel })}>
              {keys(CHANNELS).map((c) => (
                <option key={c} value={c}>
                  {CHANNELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Traded by" htmlFor="partner">
            <Select id="partner" value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>
              {lookups.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cards & cash held by" htmlFor="holder">
            <Select id="holder" value={f.holderId} onChange={(e) => setF({ ...f, holderId: e.target.value })}>
              {lookups.holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Traded with" htmlFor="cp">
            <Input id="cp" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} placeholder="@handle or name" />
          </Field>
          <Field label="Event" htmlFor="ev">
            <Select id="ev" value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}>
              <option value="">None</option>
              {lookups.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="tnotes" className="sm:col-span-2">
            <Textarea id="tnotes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      {summary ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 text-sm sm:grid-cols-4">
          <Sum label="Out value" value={<Money cents={summary.outValueCents} />} />
          <Sum label="In value" value={<Money cents={summary.inValueCents} />} />
          <Sum label="Realized profit" value={<Money cents={summary.realizedProfitCents} pl />} />
          <Sum
            label="Balance"
            value={summary.imbalanceCents === 0 ? <span className="text-profit">Even</span> : <Money cents={summary.imbalanceCents} pl />}
          />
          {summary.imbalanceCents !== 0 && ins.length ? (
            <p className="col-span-full text-xs text-muted-foreground">
              Values don&apos;t balance by {centsToInput(Math.abs(summary.imbalanceCents))}. Incoming cards will cost what you actually gave up (
              <Money cents={summary.inCostCents.reduce((a, b) => a + b, 0)} />
              ), so no paper profit is booked.
            </p>
          ) : null}
        </div>
      ) : null}

      {first ? <p className="text-sm text-destructive" role="alert">{first}</p> : null}
      <div className="sticky bottom-20 z-10 md:bottom-4">
        <Button type="submit" size="lg" className="w-full shadow-xl" disabled={pending || (!out.length && !ins.length)}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save trade
        </Button>
      </div>

      <ItemPicker
        open={picker}
        onOpenChange={setPicker}
        items={items}
        exclude={out.map((o) => o.item.id)}
        title="Card going out"
        onPick={(item) => setOut([...out, { item, quantity: "1", agreedValue: centsToInput(item.marketCents ?? item.effectiveAskingCents) }])}
      />
    </form>
  );
}

function Sum({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
