"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form-controls";
import { EXPENSE_CATEGORIES, type ExpenseCategory, keys, PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import { expenseSchema } from "@/lib/validation";
import type { FormLookups } from "@/server/lookups";
import { deleteExpense, saveExpense } from "./actions";

type Existing = {
  id: string;
  spentOn: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string;
  eventId: string | null;
  paidByHolderId: string | null;
  paymentMethod: PaymentMethod | null;
};

function ExpenseForm({ lookups, today, existing, onDone }: { lookups: FormLookups; today: string; existing?: Existing; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { check, err, setErrors } = useFormErrors(expenseSchema);
  const [f, setF] = useState({
    spentOn: existing?.spentOn ?? today,
    category: existing?.category ?? ("supplies" as ExpenseCategory),
    amount: existing ? centsToInput(existing.amountCents) : "",
    description: existing?.description ?? "",
    eventId: existing?.eventId ?? "",
    paidByHolderId: existing?.paidByHolderId ?? lookups.myHolderId ?? "",
    paymentMethod: (existing?.paymentMethod ?? "") as PaymentMethod | "",
  });

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!check(f)) return;
        start(async () => {
          const res = await saveExpense({ ...f, id: existing?.id });
          if (!res.ok) {
            if (res.fieldErrors) setErrors(res.fieldErrors);
            return void toast.error(res.error);
          }
          toast.success(existing ? "Expense updated" : "Expense added");
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="x-amount" error={err("amount")}>
          <MoneyInput id="x-amount" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Date" htmlFor="x-date" error={err("spentOn")}>
          <Input id="x-date" type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
        </Field>
      </div>
      <Field label="Category" htmlFor="x-cat">
        <Select id="x-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>
          {keys(EXPENSE_CATEGORIES).map((c) => (
            <option key={c} value={c}>
              {EXPENSE_CATEGORIES[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What was it?" htmlFor="x-desc" error={err("description")}>
        <Input id="x-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="500 penny sleeves + 100 toploaders" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid by" htmlFor="x-paid">
          <Select id="x-paid" value={f.paidByHolderId} onChange={(e) => setF({ ...f, paidByHolderId: e.target.value })}>
            {lookups.holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event" htmlFor="x-ev">
          <Select id="x-ev" value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}>
            <option value="">None</option>
            {lookups.events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Paid with" htmlFor="x-pay" hint="Cash paid at a show comes out of the cash box">
        <Select id="x-pay" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value as PaymentMethod | "" })}>
          <option value="">—</option>
          {keys(PAYMENT_METHODS).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHODS[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {existing ? "Save" : "Add expense"}
      </Button>
    </form>
  );
}

export function ExpenseDialog({ lookups, today }: { lookups: FormLookups; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add expense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add expense">
          <ExpenseForm lookups={lookups} today={today} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExpenseRowActions({ lookups, today, expense }: { lookups: FormLookups; today: string; expense: Existing }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => setOpen(true)}>
        <MoreHorizontal />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Edit expense">
          <ExpenseForm lookups={lookups} today={today} existing={expense} onDone={() => setOpen(false)} />
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!confirm("Delete this expense?")) return;
                const res = await deleteExpense(expense.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Expense deleted");
                setOpen(false);
                router.refresh();
              })
            }
          >
            Delete expense
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
