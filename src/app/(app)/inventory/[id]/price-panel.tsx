"use client";

import { Bell, Check, Clock, ExternalLink, Link2, Loader2, Search, Trash2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createAlertAction,
  deleteAlertAction,
  linkItemAction,
  searchProviderAction,
  setManualPriceAction,
  unlinkItemAction,
  followFeedAction,
} from "@/app/(app)/prices/actions";
import { PriceHistoryChart } from "@/components/charts";
import { CardThumb, formatNative, Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, MoneyInput, Select } from "@/components/ui/form-controls";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { centsToInput, formatBps, formatUSD } from "@/lib/money";
import { suggestPriceChartingField } from "@/lib/prices/pricecharting";
import { suggestTcgdexField } from "@/lib/prices/tcgdex";
import type { ProviderProduct } from "@/lib/prices/types";
import { cn } from "@/lib/utils";

type Linked = {
  provider: "tcgdex" | "pricecharting";
  productName: string | null;
  setName: string | null;
  label: string;
  url: string | null;
  lastPriceCents: number | null;
  lastFetchedAt: string | null;
  lastError: string | null;
} | null;

type Rule = { id: string; kind: "move_pct" | "above" | "below"; thresholdBps: number | null; windowDays: number; targetCents: number | null };

type ItemInfo = {
  id: string;
  name: string;
  setName: string;
  number: string | null;
  language: "EN" | "JP";
  conditionType: "raw" | "graded";
  grader: string | null;
  grade: string | null;
  variants: string[];
  marketCents: number | null;
  marketSource: string | null;
  marketUpdatedAt: string | null;
  marketMode: "auto" | "manual";
  stale: boolean;
  costPerCopyCents: number | null;
  askingCents: number | null;
};

const PROVIDER_NAMES = { tcgdex: "TCGdex", pricecharting: "PriceCharting" };

export function PricePanel({
  item,
  linked,
  history,
  rules,
  providers,
  sample,
  defaultAlert,
}: {
  item: ItemInfo;
  linked: Linked;
  history: { onDate: string; priceCents: number }[];
  rules: Rule[];
  providers: { id: "tcgdex" | "pricecharting"; name: string; enabled: boolean; cost: string }[];
  sample: boolean;
  defaultAlert: { bps: number; days: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linkOpen, setLinkOpen] = useState(false);
  const [manual, setManual] = useState(centsToInput(item.marketCents));
  const [manualSource, setManualSource] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(ok);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market price</CardTitle>
        {sample && linked ? <Badge variant="warning">sample data</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tracking-tight">
              <Money cents={item.marketCents} />
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {item.marketSource ? <span>{item.marketSource}</span> : <span>No market price yet</span>}
              {item.marketUpdatedAt ? <span>· {formatDate(item.marketUpdatedAt)}</span> : null}
              {item.marketMode === "manual" && linked ? <Badge variant="info">manual override</Badge> : null}
              {item.stale ? (
                <Badge variant="warning">
                  <Clock /> stale
                </Badge>
              ) : null}
            </p>
          </div>
          {linked && item.marketMode === "manual" ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => followFeedAction(item.id), "Following the feed again")}>
              Use feed price {linked.lastPriceCents !== null ? `(${formatUSD(linked.lastPriceCents)})` : ""}
            </Button>
          ) : null}
        </div>

        {/* Link */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {linked ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  <Link2 className="size-4 text-gold" /> {PROVIDER_NAMES[linked.provider]} · {linked.productName}
                  {linked.setName ? <span className="text-muted-foreground"> · {linked.setName}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {linked.label}
                  {linked.lastFetchedAt ? ` · updated ${formatDate(linked.lastFetchedAt)}` : ""}
                </p>
                {linked.lastError ? <p className="text-xs text-warning">Last update failed: {linked.lastError}</p> : null}
              </div>
              <div className="flex gap-1">
                {linked.url ? (
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Open at provider">
                    <a href={linked.url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}>
                  Change
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Unlink" disabled={pending} onClick={() => act(() => unlinkItemAction(item.id), "Unlinked")}>
                  <Unlink />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground">Link this card to a price source to update it automatically every day.</p>
              <Button size="sm" onClick={() => setLinkOpen(true)}>
                <Link2 /> Link price source
              </Button>
            </div>
          )}
        </div>

        {/* Manual override */}
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => setManualPriceAction({ id: item.id, market: manual, source: manualSource }), "Manual price saved");
          }}
        >
          <MoneyInput aria-label="Manual market price (each)" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Input aria-label="Source" placeholder="Source, e.g. eBay sold comps" value={manualSource} onChange={(e) => setManualSource(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {linked ? "Override" : "Save price"}
          </Button>
        </form>

        {/* History */}
        {history.length ? (
          <PriceHistoryChart data={history} costPerCopyCents={item.costPerCopyCents} askingCents={item.askingCents} />
        ) : (
          <p className="text-sm text-muted-foreground">The price history chart fills in day by day once a price is set.</p>
        )}

        <AlertRules itemId={item.id} rules={rules} defaultAlert={defaultAlert} />
      </CardContent>

      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} item={item} providers={providers} />
    </Card>
  );
}

function AlertRules({ itemId, rules, defaultAlert }: { itemId: string; rules: Rule[]; defaultAlert: { bps: number; days: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<Rule["kind"]>("above");
  const [pct, setPct] = useState("15");
  const [days, setDays] = useState("7");
  const [target, setTarget] = useState("");
  const hasPct = rules.some((r) => r.kind === "move_pct");

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Bell className="size-4 text-gold" /> Price alerts
      </p>
      <ul className="space-y-1 text-sm">
        {!hasPct && defaultAlert.bps > 0 ? (
          <li className="text-muted-foreground">
            Default: moves ±{formatBps(defaultAlert.bps, 0)} in {defaultAlert.days} days (change in Settings)
          </li>
        ) : null}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <span>
              {r.kind === "move_pct"
                ? `Moves ±${formatBps(r.thresholdBps, 0)} in ${r.windowDays} days`
                : `Market ${r.kind === "above" ? "at or above" : "at or below"} ${formatUSD(r.targetCents)}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete alert"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteAlertAction(r.id);
                  if (!res.ok) return void toast.error(res.error);
                  router.refresh();
                })
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createAlertAction({ itemId, kind, pct, windowDays: days, target });
            if (!res.ok) return void toast.error(res.error);
            toast.success("Alert added");
            setTarget("");
            router.refresh();
          });
        }}
      >
        <Select aria-label="Alert type" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as Rule["kind"])}>
          <option value="above">Goes above</option>
          <option value="below">Goes below</option>
          <option value="move_pct">Moves ±%</option>
        </Select>
        {kind === "move_pct" ? (
          <>
            <Input aria-label="Percent" inputMode="decimal" className="w-20" value={pct} onChange={(e) => setPct(e.target.value)} />
            <span className="pb-2 text-sm text-muted-foreground">% in</span>
            <Input aria-label="Days" inputMode="numeric" className="w-16" value={days} onChange={(e) => setDays(e.target.value)} />
            <span className="pb-2 text-sm text-muted-foreground">days</span>
          </>
        ) : (
          <div className="w-32">
            <MoneyInput aria-label="Target price" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          Add alert
        </Button>
      </form>
    </div>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  item,
  providers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: ItemInfo;
  providers: { id: "tcgdex" | "pricecharting"; name: string; enabled: boolean; cost: string }[];
}) {
  const router = useRouter();
  // Graded cards and Japanese cards are best priced by PriceCharting when it's set up.
  const preferPc = (item.conditionType === "graded" || item.language === "JP") && providers.some((p) => p.id === "pricecharting" && p.enabled);
  const [provider, setProvider] = useState<"tcgdex" | "pricecharting">(preferPc ? "pricecharting" : "tcgdex");
  const [language, setLanguage] = useState<"EN" | "JP">(item.language);
  const [query, setQuery] = useState(provider === "pricecharting" ? `${item.name} ${item.number?.split("/")[0] ?? ""}`.trim() : item.name);
  const [results, setResults] = useState<ProviderProduct[] | null>(null);
  const [picked, setPicked] = useState<ProviderProduct | null>(null);
  const [field, setField] = useState<string>("");
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  function search() {
    setPicked(null);
    startSearch(async () => {
      const res = await searchProviderAction({ provider, query, language });
      if (!res.ok) {
        setResults([]);
        return void toast.error(res.error);
      }
      setResults(res.data);
    });
  }

  function pick(p: ProviderProduct) {
    setPicked(p);
    setField(suggest(p, item) ?? p.fields.find((f) => f.nativeCents !== null)?.key ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Link a price source" description="Pick the matching card, then the price to follow." className="sm:max-w-2xl">
        {!picked ? (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.enabled}
                  onClick={() => {
                    setProvider(p.id);
                    setResults(null);
                  }}
                  className={cn("rounded-md px-2 py-1.5 text-xs font-semibold disabled:opacity-40", provider === p.id ? "bg-card shadow-sm" : "text-muted-foreground")}
                  title={p.enabled ? p.name : `${p.name} — add PRICECHARTING_TOKEN to enable`}
                >
                  {PROVIDER_NAMES[p.id]}
                  <span className="block font-normal text-muted-foreground">{p.enabled ? p.cost : "not set up"}</span>
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              {provider === "tcgdex" ? (
                <Select aria-label="Language" className="w-20" value={language} onChange={(e) => setLanguage(e.target.value as "EN" | "JP")}>
                  <option value="EN">EN</option>
                  <option value="JP">JP</option>
                </Select>
              ) : null}
              <Input aria-label="Search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Card name" />
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
                Search
              </Button>
            </form>
            {provider === "tcgdex" && language === "JP" ? (
              <p className="text-xs text-muted-foreground">TCGdex rarely has TCGplayer prices for Japanese cards; Cardmarket (EUR, converted daily) may be available. PriceCharting covers Japanese cards better.</p>
            ) : null}
            {provider === "tcgdex" && item.conditionType === "graded" ? (
              <p className="text-xs text-warning">TCGdex only has raw prices. For graded slabs use PriceCharting.</p>
            ) : null}
            <ul className="-mx-2 max-h-[50dvh] divide-y overflow-y-auto">
              {results?.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matches. Try fewer words or another provider.</li> : null}
              {results?.map((r) => {
                const s = suggest(r, item);
                const f = r.fields.find((x) => x.key === s);
                return (
                  <li key={r.externalId}>
                    <button type="button" onClick={() => pick(r)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent">
                      <CardThumb name={r.name} imageUrl={r.imageUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.setName, r.number, r.language === "JP" ? "JP" : null].filter(Boolean).join(" · ") || r.externalId}
                        </span>
                      </span>
                      {f ? <span className="text-sm font-semibold num">{formatNative(f.nativeCents, f.currency)}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <CardThumb name={picked.name} imageUrl={picked.imageUrl} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold">{picked.name}</p>
                <p className="text-sm text-muted-foreground">{[picked.setName, picked.number].filter(Boolean).join(" · ")}</p>
                <button type="button" className="mt-1 text-xs text-gold" onClick={() => setPicked(null)}>
                  ← Pick a different card
                </button>
              </div>
            </div>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">Which price should this card follow?</legend>
              {picked.fields.length === 0 ? <p className="text-sm text-muted-foreground">This provider has no prices for this card.</p> : null}
              <div className="max-h-[40dvh] space-y-1 overflow-y-auto">
                {picked.fields.map((f) => (
                  <label
                    key={f.key}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                      field === f.key ? "border-primary bg-primary/10" : "bg-card",
                      f.nativeCents === null && "opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="field" className="accent-[var(--primary)]" checked={field === f.key} onChange={() => setField(f.key)} disabled={f.nativeCents === null} />
                      {f.label}
                      {f.key === suggest(picked, item) ? <Badge variant="success">suggested</Badge> : null}
                    </span>
                    <span className="font-semibold num">{formatNative(f.nativeCents, f.currency)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              size="lg"
              disabled={!field || saving}
              onClick={() =>
                startSave(async () => {
                  const res = await linkItemAction({ itemId: item.id, provider: picked.provider, externalId: picked.externalId, priceField: field });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.data.priceCents !== null ? `Linked — market ${formatUSD(res.data.priceCents)}` : "Linked");
                  onOpenChange(false);
                  setPicked(null);
                  router.refresh();
                })
              }
            >
              {saving ? <Loader2 className="animate-spin" /> : <Check />} Follow this price
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Same suggestion rules the server uses (pure modules, safe in the browser). */
function suggest(p: ProviderProduct, item: ItemInfo) {
  const c = { conditionType: item.conditionType, grader: item.grader, grade: item.grade, variants: item.variants, language: item.language };
  return p.provider === "tcgdex" ? suggestTcgdexField(p, c) : suggestPriceChartingField(p, c);
}
