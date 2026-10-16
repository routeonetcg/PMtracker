"use client";

import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/misc";
import { importRowSchema, toCsv } from "@/lib/csv";
import { importInventory } from "./actions";

const MAX_ROWS = 2000;

export function ImportForm({ columns }: { columns: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();

  const checked = useMemo(
    () =>
      raw.map((r, i) => {
        const res = importRowSchema.safeParse(r);
        return { line: i + 2, raw: r, ok: res.success, data: res.success ? res.data : null, error: res.success ? null : res.error.issues.map((x) => x.message).join("; ") };
      }),
    [raw],
  );
  const good = checked.filter((c) => c.ok);
  const bad = checked.filter((c) => !c.ok);

  function load(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        if (res.data.length > MAX_ROWS) {
          toast.error(`That file has ${res.data.length} rows. Import up to ${MAX_ROWS} at a time.`);
          return;
        }
        setRaw(res.data);
      },
      error: (e) => toast.error(e.message),
    });
  }

  function template() {
    const csv = toCsv(columns.filter((c) => !["item_no", "cost_basis", "market_updated", "held_by"].includes(c)), [
      ["Charizard ex", "Obsidian Flames", "OBF", "228/197", "EN", "Hyper Rare (Gold)", "", "NM", "", "", "", "", "1", "In Stock", "Binder", "chase", "20.00", "", "", "", "2026-10-01", "35.00", "TCGplayer", "manual", "35.00", "", ""],
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "route-one-import-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
      {raw.length === 0 ? (
        <EmptyState
          icon={<FileUp />}
          title="Choose a CSV file"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => input.current?.click()}>
                <FileUp /> Choose file
              </Button>
              <Button variant="outline" onClick={template}>
                Download template
              </Button>
            </div>
          }
        >
          Rows are checked before anything is saved. Sales history isn&apos;t imported — record sales in HQ.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="text-sm">
                <p className="font-semibold">{fileName}</p>
                <p className="text-muted-foreground">
                  <span className="text-profit">{good.length} ready</span>
                  {bad.length ? <span className="text-loss"> · {bad.length} with problems (skipped)</span> : null}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setRaw([]); if (input.current) input.current.value = ""; }}>
                  Choose another
                </Button>
                <Button
                  disabled={pending || good.length === 0}
                  onClick={() =>
                    start(async () => {
                      const res = await importInventory(good.map((g) => g.raw));
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(`Imported ${res.data} rows`);
                      router.push("/inventory");
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Import {good.length} rows
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Purchase</th>
                  <th className="px-3 py-2">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {checked.slice(0, 300).map((c) => (
                  <tr key={c.line} className={c.ok ? "" : "bg-loss/5"}>
                    <td className="px-3 py-2 text-muted-foreground num">{c.line}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{c.raw.name || "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.raw.set} {c.raw.number}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {c.data ? <Badge variant="outline">{c.data.conditionType === "graded" ? `${c.data.grader} ${c.data.grade}` : c.data.rawCondition}</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-right num">{c.data?.quantity ?? ""}</td>
                    <td className="px-3 py-2 text-right">{c.data ? c.data.purchase === null ? <Badge variant="warning">missing</Badge> : <Money cents={c.data.purchase} /> : null}</td>
                    <td className="px-3 py-2">
                      {c.ok ? (
                        <CheckCircle2 className="size-4 text-profit" aria-label="OK" />
                      ) : (
                        <span className="flex items-start gap-1.5 text-xs text-loss">
                          <XCircle className="mt-0.5 size-3.5 shrink-0" /> {c.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checked.length > 300 ? <p className="p-3 text-xs text-muted-foreground">Showing the first 300 of {checked.length} rows.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
