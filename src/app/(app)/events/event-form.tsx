"use client";

import { CalendarPlus, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form-controls";
import { eventSchema } from "@/lib/validation";
import { saveEventAction } from "./actions";
import type { EventDraft } from "./draft";

export function EventDialog({
  holders,
  myHolderId,
  today,
  existing,
}: {
  holders: { id: string; name: string }[];
  myHolderId: string | null;
  today: string;
  existing?: EventDraft;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { check, err, setErrors } = useFormErrors(eventSchema);
  const blank: EventDraft = {
    name: "",
    startsOn: today,
    endsOn: "",
    location: "",
    tableFee: "",
    tableFeePaidByHolderId: myHolderId ?? "",
    float: "",
    cashHolderId: myHolderId ?? "",
    notes: "",
  };
  const [f, setF] = useState<EventDraft>(existing ?? blank);
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <>
      {existing ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus /> New show
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={existing ? "Edit show" : "New show"} description="The table fee is added to expenses automatically.">
          <form
            noValidate
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!check(f)) return;
              start(async () => {
                const res = await saveEventAction(f);
                if (!res.ok) {
                  if (res.fieldErrors) setErrors(res.fieldErrors);
                  return void toast.error(res.error);
                }
                toast.success(existing ? "Show updated" : "Show added");
                setOpen(false);
                if (!existing) router.push(`/events/${res.data}`);
                router.refresh();
              });
            }}
          >
            <Field label="Name" htmlFor="ev-name" error={err("name")}>
              <Input id="ev-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Gold Coast Card Show" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="ev-start" error={err("startsOn")}>
                <Input id="ev-start" type="date" value={f.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
              </Field>
              <Field label="Last day (multi-day)" htmlFor="ev-end" error={err("endsOn")}>
                <Input id="ev-end" type="date" value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
              </Field>
            </div>
            <Field label="Location" htmlFor="ev-loc">
              <Input id="ev-loc" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Venue, city" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Table fee" htmlFor="ev-fee" error={err("tableFee")}>
                <MoneyInput id="ev-fee" value={f.tableFee} onChange={(e) => set("tableFee", e.target.value)} />
              </Field>
              <Field label="Table fee paid by" htmlFor="ev-feeby">
                <Select id="ev-feeby" value={f.tableFeePaidByHolderId} onChange={(e) => set("tableFeePaidByHolderId", e.target.value)}>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Starting cash (float)" htmlFor="ev-float" error={err("float")}>
                <MoneyInput id="ev-float" value={f.float} onChange={(e) => set("float", e.target.value)} />
              </Field>
              <Field label="Cash box held by" htmlFor="ev-cash">
                <Select id="ev-cash" value={f.cashHolderId} onChange={(e) => set("cashHolderId", e.target.value)}>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes" htmlFor="ev-notes">
              <Textarea id="ev-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Table number, load-in time…" />
            </Field>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {existing ? "Save" : "Add show"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
