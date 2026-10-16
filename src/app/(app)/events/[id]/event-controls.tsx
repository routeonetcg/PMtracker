"use client";

import { Loader2, Lock, Play, RotateCcw, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, MoneyInput, Select } from "@/components/ui/form-controls";
import { centsToInput, formatUSD, parseDollars } from "@/lib/money";
import { closeEventAction, deleteEventAction, reopenEventAction, startEventAction } from "../actions";

export function EventControls({
  event,
  holders,
  myHolderId,
  expectedCashCents,
}: {
  event: { id: string; status: "planned" | "live" | "closed"; cashHolderId: string | null; floatCents: number; countedCashCents: number | null };
  holders: { id: string; name: string }[];
  myHolderId: string | null;
  expectedCashCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [startOpen, setStartOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [holder, setHolder] = useState(event.cashHolderId ?? myHolderId ?? holders[0]?.id ?? "");
  const [float, setFloat] = useState(centsToInput(event.floatCents));
  const [counted, setCounted] = useState(event.countedCashCents !== null ? centsToInput(event.countedCashCents) : "");
  const countedCents = parseDollars(counted);
  const diff = countedCents === null ? null : countedCents - expectedCashCents;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(msg);
      after?.();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {event.status === "planned" ? (
        <Button
          size="lg"
          onClick={() => {
            // Use the show's current values (they may have been edited since this page loaded).
            setHolder(event.cashHolderId ?? myHolderId ?? holders[0]?.id ?? "");
            setFloat(centsToInput(event.floatCents));
            setStartOpen(true);
          }}
        >
          <Play /> Start show
        </Button>
      ) : null}
      {event.status === "live" ? (
        <>
          <Button asChild size="lg">
            <Link href={`/show/${event.id}`}>
              <Zap /> Show Mode
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => setCloseOpen(true)}>
            <Lock /> Close show
          </Button>
        </>
      ) : null}
      {event.status === "closed" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => reopenEventAction(event.id), "Show reopened")}>
          <RotateCcw /> Reopen
        </Button>
      ) : null}
      {event.status !== "live" ? (
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this show? Its table-fee expense is removed too.")) return;
            run(() => deleteEventAction(event.id), "Show deleted", () => router.push("/events"));
          }}
        >
          <Trash2 /> Delete
        </Button>
      ) : null}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent title="Start the show" description="Count the starting cash before the doors open.">
          <div className="grid gap-3">
            <Field label="Cash box held by" htmlFor="st-holder">
              <Select id="st-holder" value={holder} onChange={(e) => setHolder(e.target.value)}>
                {holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Starting cash (float)" htmlFor="st-float">
              <MoneyInput id="st-float" className="h-12 text-lg" value={float} onChange={(e) => setFloat(e.target.value)} />
            </Field>
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                run(() => startEventAction({ id: event.id, cashHolderId: holder, float: float || "0" }), "Show is live", () => {
                  setStartOpen(false);
                  router.push(`/show/${event.id}`);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Zap />} Go live & open Show Mode
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent title="Close the show" description="Count the cash box. We'll compare it with what should be there.">
          <div className="grid gap-3">
            <div className="rounded-lg bg-muted p-3 text-sm">
              Expected in the box: <strong className="num">{formatUSD(expectedCashCents)}</strong>
            </div>
            <Field label="Cash counted" htmlFor="cl-count">
              <MoneyInput id="cl-count" autoFocus className="h-12 text-lg" value={counted} onChange={(e) => setCounted(e.target.value)} />
            </Field>
            {diff !== null ? (
              <p className={`text-sm font-semibold ${diff === 0 ? "text-profit" : diff > 0 ? "text-warning" : "text-loss"}`}>
                {diff === 0 ? "Exactly right." : diff > 0 ? `${formatUSD(diff)} over` : `${formatUSD(-diff)} short`}
              </p>
            ) : null}
            <Button
              size="lg"
              disabled={pending}
              onClick={() => run(() => closeEventAction({ id: event.id, countedCash: counted }), "Show closed", () => setCloseOpen(false))}
            >
              <Lock /> Close show
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
