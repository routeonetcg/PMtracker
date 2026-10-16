"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { settingsSchema } from "@/lib/validation";
import { saveSettings } from "./actions";

type S = {
  defaultMarkupPct: string;
  roundAskingTo: string;
  staleDays: string;
  slowMoverDays: string;
  ebayFeePct: string;
  ebayFeeFixed: string;
  defaultAlertPct: string;
  alertWindowDays: string;
  cardFeePct: string;
  cardFeeFixed: string;
};

export function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const { check, err } = useFormErrors(settingsSchema);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing & alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!check(f)) return;
            start(async () => {
              const res = await saveSettings(f);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Settings saved");
              router.refresh();
            });
          }}
        >
          <Field label="Default markup over market (%)" htmlFor="s-mu" error={err("defaultMarkupPct")}>
            <Input id="s-mu" inputMode="decimal" value={f.defaultMarkupPct} onChange={(e) => setF({ ...f, defaultMarkupPct: e.target.value })} />
          </Field>
          <Field label="Round markup prices up to" htmlFor="s-round" hint="1 = whole dollars, 5 = next $5, 0 = exact" error={err("roundAskingTo")}>
            <MoneyInput id="s-round" value={f.roundAskingTo} onChange={(e) => setF({ ...f, roundAskingTo: e.target.value })} />
          </Field>
          <Field label="Price is stale after (days)" htmlFor="s-stale" error={err("staleDays")}>
            <Input id="s-stale" inputMode="numeric" value={f.staleDays} onChange={(e) => setF({ ...f, staleDays: e.target.value })} />
          </Field>
          <Field label="Slow mover after (days)" htmlFor="s-slow" error={err("slowMoverDays")}>
            <Input id="s-slow" inputMode="numeric" value={f.slowMoverDays} onChange={(e) => setF({ ...f, slowMoverDays: e.target.value })} />
          </Field>
          <Field label="eBay fee estimate (%)" htmlFor="s-ebay" error={err("ebayFeePct")}>
            <Input id="s-ebay" inputMode="decimal" value={f.ebayFeePct} onChange={(e) => setF({ ...f, ebayFeePct: e.target.value })} />
          </Field>
          <Field label="eBay fixed fee per order" htmlFor="s-ebayfix" error={err("ebayFeeFixed")}>
            <MoneyInput id="s-ebayfix" value={f.ebayFeeFixed} onChange={(e) => setF({ ...f, ebayFeeFixed: e.target.value })} />
          </Field>
          <Field label="Alert when any card moves ± (%)" htmlFor="s-alert" hint="0 turns the default alert off" error={err("defaultAlertPct")}>
            <Input id="s-alert" inputMode="decimal" value={f.defaultAlertPct} onChange={(e) => setF({ ...f, defaultAlertPct: e.target.value })} />
          </Field>
          <Field label="…within (days)" htmlFor="s-alertdays" error={err("alertWindowDays")}>
            <Input id="s-alertdays" inputMode="numeric" value={f.alertWindowDays} onChange={(e) => setF({ ...f, alertWindowDays: e.target.value })} />
          </Field>
          <Field label="Card reader fee (%)" htmlFor="s-cardfee" hint="Taken off Card payments in Show Mode" error={err("cardFeePct")}>
            <Input id="s-cardfee" inputMode="decimal" value={f.cardFeePct} onChange={(e) => setF({ ...f, cardFeePct: e.target.value })} />
          </Field>
          <Field label="Card reader fixed fee" htmlFor="s-cardfix" error={err("cardFeeFixed")}>
            <MoneyInput id="s-cardfix" value={f.cardFeeFixed} onChange={(e) => setF({ ...f, cardFeeFixed: e.target.value })} />
          </Field>
          <Button type="submit" disabled={pending} className="sm:col-span-2">
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
