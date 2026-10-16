"use client";

import { AlertTriangle, Boxes, CheckSquare, Clock, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CardThumb, cardSubtitle, Money, StatusBadge } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/misc";
import {
  conditionLabel,
  EDITABLE_STATUSES,
  GRADERS,
  type ItemStatus,
  keys,
  LOCATIONS,
  STATUSES,
} from "@/lib/labels";
import { itemHaystack, matches } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/server/inventory";
import { bulkEditItems } from "./actions";

type Holder = { id: string; name: string };

type SortKey = "newest" | "name" | "market" | "asking" | "pl" | "age";
const SORTS: Record<SortKey, string> = {
  newest: "Newest first",
  name: "Name A–Z",
  market: "Market value",
  asking: "Asking price",
  pl: "Unrealized P/L",
  age: "Days in stock",
};

type Filters = {
  q: string;
  status: "active" | "all" | ItemStatus;
  language: "" | "EN" | "JP";
  condition: "" | "raw" | "graded";
  grader: string;
  location: string;
  holder: string;
  tag: string;
  cost?: "missing";
  price: "" | "missing" | "stale";
};

const ACTIVE = new Set<ItemStatus>(["in_stock", "listed", "on_hold", "in_grading"]);

export function InventoryBrowser({
  rows,
  holders,
  tags,
  initialFilter,
}: {
  rows: InventoryRow[];
  holders: Holder[];
  tags: string[];
  initialFilter: { cost?: "missing"; q?: string };
}) {
  const [f, setF] = useState<Filters>({
    q: initialFilter.q ?? "",
    status: "active",
    language: "",
    condition: "",
    grader: "",
    location: "",
    holder: "",
    tag: "",
    cost: initialFilter.cost,
    price: "",
  });
  const [sort, setSort] = useState<SortKey>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const q = useDeferredValue(f.q);

  const haystacks = useMemo(() => new Map(rows.map((r) => [r.id, itemHaystack(r)])), [rows]);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (f.status === "active" ? !ACTIVE.has(r.status) : f.status !== "all" && r.status !== f.status) return false;
      if (f.language && r.card.language !== f.language) return false;
      if (f.condition && r.conditionType !== f.condition) return false;
      if (f.grader && r.grader !== f.grader) return false;
      if (f.location && r.location !== f.location) return false;
      if (f.holder && r.holderId !== f.holder) return false;
      if (f.tag && !r.tags.includes(f.tag)) return false;
      if (f.cost === "missing" && !r.costMissing) return false;
      if (f.price === "missing" && r.marketCents !== null) return false;
      if (f.price === "stale" && !r.stale) return false;
      return matches(haystacks.get(r.id) ?? "", q);
    });
    const by: Record<SortKey, (a: InventoryRow, b: InventoryRow) => number> = {
      newest: (a, b) => b.itemNo - a.itemNo,
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      market: (a, b) => (b.marketTotalCents ?? -1) - (a.marketTotalCents ?? -1),
      asking: (a, b) => (b.effectiveAskingCents ?? -1) - (a.effectiveAskingCents ?? -1),
      pl: (a, b) => (b.unrealizedCents ?? -Infinity) - (a.unrealizedCents ?? -Infinity),
      age: (a, b) => b.daysInStock - a.daysInStock,
    };
    return out.sort(by[sort]);
  }, [rows, f, q, sort, haystacks]);

  const totals = useMemo(
    () => ({
      units: filtered.reduce((a, r) => a + r.quantity, 0),
      cost: filtered.reduce((a, r) => a + r.costBasisCents, 0),
      market: filtered.reduce((a, r) => a + (r.marketTotalCents ?? 0), 0),
    }),
    [filtered],
  );

  const activeFilterCount = [f.language, f.condition, f.grader, f.location, f.holder, f.tag, f.cost, f.price].filter(Boolean).length + (f.status !== "active" ? 1 : 0);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Boxes />}
        title="No cards yet"
        action={
          <Button asChild>
            <Link href="/buy">Add your first cards</Link>
          </Button>
        }
      >
        Add cards one at a time, record a bulk lot, or import a spreadsheet.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20 -mx-4 space-y-2 bg-background/90 px-4 py-2 backdrop-blur-md md:top-0 md:mx-0 md:px-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search name, set, number, cert, tag, #id…"
              value={f.q}
              onChange={(e) => set("q", e.target.value)}
              className="h-11 pl-9"
              aria-label="Search inventory"
            />
          </div>
          <Button
            variant={activeFilterCount ? "default" : "outline"}
            className="h-11"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount ? <span className="num">({activeFilterCount})</span> : null}
          </Button>
          <Button
            variant={selectMode ? "default" : "outline"}
            className="h-11"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            aria-pressed={selectMode}
          >
            <CheckSquare />
            <span className="hidden sm:inline">Select</span>
          </Button>
        </div>

        {showFilters ? (
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select value={f.status} onChange={(e) => set("status", e.target.value as Filters["status"])} aria-label="Status">
              <option value="active">On hand (active)</option>
              <option value="all">All statuses</option>
              {keys(STATUSES).map((s) => (
                <option key={s} value={s}>
                  {STATUSES[s]}
                </option>
              ))}
            </Select>
            <Select value={f.language} onChange={(e) => set("language", e.target.value as Filters["language"])} aria-label="Language">
              <option value="">EN + JP</option>
              <option value="EN">English</option>
              <option value="JP">Japanese</option>
            </Select>
            <Select value={f.condition} onChange={(e) => set("condition", e.target.value as Filters["condition"])} aria-label="Raw or graded">
              <option value="">Raw + graded</option>
              <option value="raw">Raw</option>
              <option value="graded">Graded</option>
            </Select>
            <Select value={f.grader} onChange={(e) => set("grader", e.target.value)} aria-label="Grader">
              <option value="">Any grader</option>
              {keys(GRADERS).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
            <Select value={f.location} onChange={(e) => set("location", e.target.value)} aria-label="Location">
              <option value="">Any location</option>
              {keys(LOCATIONS).map((l) => (
                <option key={l} value={l}>
                  {LOCATIONS[l]}
                </option>
              ))}
            </Select>
            <Select value={f.holder} onChange={(e) => set("holder", e.target.value)} aria-label="Held by">
              <option value="">Held by anyone</option>
              {holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
            <Select value={f.tag} onChange={(e) => set("tag", e.target.value)} aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Select value={f.price} onChange={(e) => set("price", e.target.value as Filters["price"])} aria-label="Market price">
              <option value="">Any market price</option>
              <option value="missing">No market price</option>
              <option value="stale">Stale price</option>
            </Select>
            <Select value={f.cost ?? ""} onChange={(e) => set("cost", e.target.value ? "missing" : undefined)} aria-label="Cost">
              <option value="">Any cost</option>
              <option value="missing">Cost missing</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              {keys(SORTS).map((s) => (
                <option key={s} value={s}>
                  Sort: {SORTS[s]}
                </option>
              ))}
            </Select>
            {activeFilterCount ? (
              <Button
                variant="ghost"
                onClick={() =>
                  setF((p) => ({ ...p, status: "active", language: "", condition: "", grader: "", location: "", holder: "", tag: "", cost: undefined, price: "" }))
                }
              >
                <X /> Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground num">{totals.units}</strong> cards
          </span>
          <span>
            cost <Money cents={totals.cost} whole className="text-foreground" />
          </span>
          <span>
            market <Money cents={totals.market} whole className="text-foreground" />
          </span>
          {selectMode ? (
            <button
              className="ml-auto font-medium text-gold"
              onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))}
            >
              {selected.size === filtered.length ? "Select none" : `Select all ${filtered.length}`}
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Filter />} title="Nothing matches">
          Try a different search or clear the filters.
        </EmptyState>
      ) : (
        <>
          {/* Phone: list */}
          <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                {selectMode ? <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.card.name}`} /> : null}
                <Link href={selectMode ? "#" : `/inventory/${r.id}`} onClick={(e) => selectMode && (e.preventDefault(), toggle(r.id))} className="flex min-w-0 flex-1 items-center gap-3">
                  <CardThumb photoId={r.photoId} imageUrl={r.card.imageUrl} name={r.card.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {r.card.name}
                      {r.quantity > 1 ? <span className="text-muted-foreground"> ×{r.quantity}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{cardSubtitle(r.card)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant={r.conditionType === "graded" ? "default" : "outline"}>{conditionLabel(r)}</Badge>
                      {r.status !== "in_stock" ? <StatusBadge status={r.status} /> : null}
                      {r.costMissing ? (
                        <Badge variant="warning">
                          <AlertTriangle /> cost
                        </Badge>
                      ) : null}
                      {r.stale ? (
                        <Badge variant="warning">
                          <Clock /> stale
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">
                      <Money cents={r.effectiveAskingCents} whole />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      mkt <Money cents={r.marketCents} whole />
                    </p>
                    {r.unrealizedCents !== null && !r.costMissing ? (
                      <p className="text-xs">
                        <Money cents={r.unrealizedCents} pl whole />
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  {selectMode ? <th className="w-10 px-3 py-2.5" /> : null}
                  <th className="px-3 py-2.5 font-medium">Card</th>
                  <th className="px-3 py-2.5 font-medium">Condition</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Market</th>
                  <th className="px-3 py-2.5 text-right font-medium">Asking</th>
                  <th className="px-3 py-2.5 text-right font-medium">Unrealized</th>
                  <th className="px-3 py-2.5 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-accent/40", selected.has(r.id) && "bg-primary/5")}>
                    {selectMode ? (
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.card.name}`} />
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${r.id}`} className="flex items-center gap-3">
                        <CardThumb photoId={r.photoId} imageUrl={r.card.imageUrl} name={r.card.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block max-w-72 truncate font-semibold hover:text-gold">{r.card.name}</span>
                          <span className="block max-w-72 truncate text-xs text-muted-foreground">
                            #{r.itemNo} · {cardSubtitle(r.card)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={r.conditionType === "graded" ? "default" : "outline"}>{conditionLabel(r)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right num">{r.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {r.costMissing ? <Badge variant="warning">missing</Badge> : <Money cents={r.costBasisCents} />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money cents={r.marketTotalCents} />
                      {r.stale ? <Clock className="ml-1 inline size-3 text-warning" aria-label="stale" /> : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      <Money cents={r.effectiveAskingCents} />
                    </td>
                    <td className="px-3 py-2 text-right">{r.costMissing ? "—" : <Money cents={r.unrealizedCents} pl />}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground num">{r.daysInStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectMode && selected.size > 0 ? (
        <div className="fixed inset-x-4 bottom-20 z-30 flex items-center justify-between gap-3 rounded-2xl border bg-popover p-3 shadow-2xl md:bottom-6 md:left-auto md:w-96">
          <span className="text-sm font-medium">
            <span className="num">{selected.size}</span> selected
          </span>
          <Button onClick={() => setBulkOpen(true)}>Bulk edit</Button>
        </div>
      ) : null}

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={[...selected]}
        holders={holders}
        onDone={() => {
          setSelected(new Set());
          setSelectMode(false);
        }}
      />
    </div>
  );
}

function BulkEditDialog({
  open,
  onOpenChange,
  ids,
  holders,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  holders: Holder[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [holder, setHolder] = useState("");
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState("");
  const [markup, setMarkup] = useState("");

  function submit() {
    start(async () => {
      const split = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await bulkEditItems({
        ids,
        status: (status || undefined) as never,
        location: (location || undefined) as never,
        holderId: holder || undefined,
        addTags: split(addTags),
        removeTags: split(removeTags),
        markupPct: markup || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Updated ${res.data} row${res.data === 1 ? "" : "s"}`);
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${ids.length} card${ids.length === 1 ? "" : "s"}`} description="Only the fields you fill in are changed.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Keep as is</option>
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUSES[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">Keep as is</option>
              {keys(LOCATIONS).map((l) => (
                <option key={l} value={l}>
                  {LOCATIONS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Held by">
            <Select value={holder} onChange={(e) => setHolder(e.target.value)}>
              <option value="">Keep as is</option>
              {holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Asking = market + markup %" hint="Switches these cards to markup pricing">
            <Input inputMode="decimal" placeholder="e.g. 15" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </Field>
          <Field label="Add tags" hint="Comma separated">
            <Input value={addTags} onChange={(e) => setAddTags(e.target.value)} placeholder="show-case, vintage" />
          </Field>
          <Field label="Remove tags">
            <Input value={removeTags} onChange={(e) => setRemoveTags(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Sold and traded cards are skipped — undo the sale or trade instead.</p>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Apply changes"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
