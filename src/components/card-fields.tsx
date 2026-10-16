"use client";

import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { searchProviderAction } from "@/app/(app)/prices/actions";
import { CardThumb } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form-controls";
import type { ProviderProduct } from "@/lib/prices/types";
import { GRADERS, keys, LANGUAGES, RARITY_SUGGESTIONS, RAW_CONDITIONS, VARIANTS, type Variant } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type CardDraft = {
  name: string;
  setName: string;
  setCode: string;
  number: string;
  language: "EN" | "JP";
  rarity: string;
  variants: Variant[];
  imageUrl: string;
};

export type ConditionDraft = {
  conditionType: "raw" | "graded";
  rawCondition: keyof typeof RAW_CONDITIONS;
  grader: keyof typeof GRADERS | "";
  grade: string;
  gradeLabel: string;
  certNumber: string;
};

export type AskingDraft = { askingMode: "manual" | "markup"; asking: string; markupPct: string };

export const emptyCard = (): CardDraft => ({
  name: "",
  setName: "",
  setCode: "",
  number: "",
  language: "EN",
  rarity: "",
  variants: [],
  imageUrl: "",
});
export const emptyCondition = (): ConditionDraft => ({
  conditionType: "raw",
  rawCondition: "NM",
  grader: "",
  grade: "",
  gradeLabel: "",
  certNumber: "",
});
export const emptyAsking = (markupPct = ""): AskingDraft => ({ askingMode: "manual", asking: "", markupPct });

export type KnownCard = { name: string; setName: string; setCode: string | null; number: string | null; language: "EN" | "JP"; rarity: string | null };

type ErrFn = (path: string) => string | undefined;

/** Name / set / number / language / rarity / variants. */
export function CardFields({
  value,
  onChange,
  err,
  prefix,
  known = [],
  idPrefix,
}: {
  value: CardDraft;
  onChange: (v: CardDraft) => void;
  err: ErrFn;
  prefix: string;
  known?: KnownCard[];
  idPrefix: string;
}) {
  const set = <K extends keyof CardDraft>(k: K, v: CardDraft[K]) => onChange({ ...value, [k]: v });
  const setNames = [...new Set(known.map((k) => k.setName))].sort();

  function pickName(name: string) {
    // "Charizard ex · Obsidian Flames 228/197" from the suggestion list fills in the rest.
    const m = known.find((k) => suggestionLabel(k) === name);
    if (m) {
      onChange({
        ...value,
        name: m.name,
        setName: m.setName,
        setCode: m.setCode ?? "",
        number: m.number ?? "",
        language: m.language,
        rarity: m.rarity ?? value.rarity,
      });
    } else set("name", name);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Card name" htmlFor={`${idPrefix}-name`} error={err(`${prefix}.name`)} className="sm:col-span-2">
        <div className="flex gap-2">
        <Input
          id={`${idPrefix}-name`}
          list={`${idPrefix}-names`}
          value={value.name}
          onChange={(e) => pickName(e.target.value)}
          placeholder="e.g. Charizard ex"
          autoComplete="off"
          aria-invalid={!!err(`${prefix}.name`)}
        />
        <CardLookup
          query={value.name}
          language={value.language}
          onPick={(p) =>
            onChange({
              ...value,
              name: p.name,
              setName: p.setName ?? value.setName,
              number: p.number ?? value.number,
              language: p.language,
              rarity: p.rarity ?? value.rarity,
              imageUrl: p.imageUrl ?? value.imageUrl,
            })
          }
        />
        </div>
        <datalist id={`${idPrefix}-names`}>
          {known.slice(0, 300).map((k) => (
            <option key={suggestionLabel(k)} value={suggestionLabel(k)} />
          ))}
        </datalist>
      </Field>
      <Field label="Set" htmlFor={`${idPrefix}-set`} error={err(`${prefix}.setName`)}>
        <Input
          id={`${idPrefix}-set`}
          list={`${idPrefix}-sets`}
          value={value.setName}
          onChange={(e) => set("setName", e.target.value)}
          placeholder="e.g. Obsidian Flames"
          autoComplete="off"
          aria-invalid={!!err(`${prefix}.setName`)}
        />
        <datalist id={`${idPrefix}-sets`}>
          {setNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Number" htmlFor={`${idPrefix}-num`}>
          <Input id={`${idPrefix}-num`} value={value.number} onChange={(e) => set("number", e.target.value)} placeholder="228/197" autoComplete="off" />
        </Field>
        <Field label="Language" htmlFor={`${idPrefix}-lang`}>
          <Select id={`${idPrefix}-lang`} value={value.language} onChange={(e) => set("language", e.target.value as "EN" | "JP")}>
            {keys(LANGUAGES).map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Rarity" htmlFor={`${idPrefix}-rarity`}>
        <Input id={`${idPrefix}-rarity`} list="rarity-suggestions" value={value.rarity} onChange={(e) => set("rarity", e.target.value)} placeholder="e.g. Special Illustration Rare" autoComplete="off" />
        <datalist id="rarity-suggestions">
          {RARITY_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Variant</legend>
        <div className="flex flex-wrap gap-1.5">
          {keys(VARIANTS).map((v) => {
            const on = value.variants.includes(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => set("variants", on ? value.variants.filter((x) => x !== v) : [...value.variants, v])}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {VARIANTS[v]}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** Look the card up in the TCGdex catalog and fill in set, number, rarity and image. */
function CardLookup({ query, language, onPick }: { query: string; language: "EN" | "JP"; onPick: (p: ProviderProduct) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(query);
  const [lang, setLang] = useState(language);
  const [results, setResults] = useState<ProviderProduct[] | null>(null);
  const [pending, start] = useTransition();
  const search = (query = q, language = lang) =>
    start(async () => {
      const res = await searchProviderAction({ provider: "tcgdex", query, language });
      if (!res.ok) {
        setResults([]);
        return void toast.error(res.error);
      }
      setResults(res.data);
    });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        aria-label="Look up card"
        onClick={() => {
          setQ(query);
          setLang(language);
          setResults(null);
          setOpen(true);
          // Search right away with what's already typed.
          if (query.trim().length >= 2) search(query, language);
        }}
      >
        <Search /> <span className="hidden sm:inline">Look up</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Look up a card" description="From the free TCGdex catalog. Fills in set, number, rarity and picture." className="sm:max-w-xl">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              search();
            }}
          >
            <Select aria-label="Language" className="w-20" value={lang} onChange={(e) => setLang(e.target.value as "EN" | "JP")}>
              <option value="EN">EN</option>
              <option value="JP">JP</option>
            </Select>
            <Input aria-label="Card name" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Charizard ex" />
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Search />}
            </Button>
          </form>
          <ul className="-mx-2 max-h-[55dvh] divide-y overflow-y-auto">
            {results?.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matches — you can still type the details yourself.</li> : null}
            {results?.map((r) => (
              <li key={r.externalId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    onPick(r);
                    setOpen(false);
                  }}
                >
                  <CardThumb name={r.name} imageUrl={r.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[r.setName, r.number, r.rarity].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function suggestionLabel(k: KnownCard) {
  return `${k.name} · ${k.setName}${k.number ? ` ${k.number}` : ""}${k.language === "JP" ? " (JP)" : ""}`;
}

/** Raw (NM…DMG) or graded (company + grade + cert). */
export function ConditionFields({
  value,
  onChange,
  err,
  prefix,
  idPrefix,
}: {
  value: ConditionDraft;
  onChange: (v: ConditionDraft) => void;
  err: ErrFn;
  prefix: string;
  idPrefix: string;
}) {
  const set = <K extends keyof ConditionDraft>(k: K, v: ConditionDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Raw or graded">
        {(["raw", "graded"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={value.conditionType === t}
            onClick={() => set("conditionType", t)}
            className={cn(
              "rounded-md py-2 text-sm font-semibold capitalize transition-colors",
              value.conditionType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {value.conditionType === "raw" ? (
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Condition">
          {keys(RAW_CONDITIONS).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.rawCondition === c}
              title={RAW_CONDITIONS[c]}
              onClick={() => set("rawCondition", c)}
              className={cn(
                "rounded-lg border py-2.5 text-sm font-semibold",
                value.rawCondition === c ? "border-primary bg-primary/15 text-gold" : "bg-card text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Company" htmlFor={`${idPrefix}-grader`} error={err(`${prefix}.grader`)}>
            <Select id={`${idPrefix}-grader`} value={value.grader} onChange={(e) => set("grader", e.target.value as ConditionDraft["grader"])} aria-invalid={!!err(`${prefix}.grader`)}>
              <option value="">Pick…</option>
              {keys(GRADERS).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Grade" htmlFor={`${idPrefix}-grade`} error={err(`${prefix}.grade`)}>
            <Input
              id={`${idPrefix}-grade`}
              inputMode="decimal"
              value={value.grade}
              onChange={(e) => set("grade", e.target.value)}
              placeholder="10"
              aria-invalid={!!err(`${prefix}.grade`)}
            />
          </Field>
          <Field label="Cert #" htmlFor={`${idPrefix}-cert`}>
            <Input id={`${idPrefix}-cert`} inputMode="numeric" value={value.certNumber} onChange={(e) => set("certNumber", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Label" htmlFor={`${idPrefix}-label`}>
            <Input id={`${idPrefix}-label`} value={value.gradeLabel} onChange={(e) => set("gradeLabel", e.target.value)} placeholder="Black Label" />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Asking price: a fixed amount, or market × (1 + markup). */
export function AskingFields({
  value,
  onChange,
  err,
  prefix,
  idPrefix,
  previewCents,
}: {
  value: AskingDraft;
  onChange: (v: AskingDraft) => void;
  err: ErrFn;
  prefix: string;
  idPrefix: string;
  previewCents?: string | null;
}) {
  const set = <K extends keyof AskingDraft>(k: K, v: AskingDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Asking price</span>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {(["manual", "markup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("askingMode", m)}
              className={cn("rounded-md px-2.5 py-1 font-semibold", value.askingMode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {m === "manual" ? "Set price" : "Market + %"}
            </button>
          ))}
        </div>
      </div>
      {value.askingMode === "manual" ? (
        <MoneyInput id={`${idPrefix}-asking`} aria-label="Asking price" value={value.asking} onChange={(e) => set("asking", e.target.value)} aria-invalid={!!err(`${prefix}.asking`)} />
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id={`${idPrefix}-markup`}
              aria-label="Markup percent"
              inputMode="decimal"
              value={value.markupPct}
              onChange={(e) => set("markupPct", e.target.value)}
              className="pr-8 num"
              aria-invalid={!!err(`${prefix}.markupPct`)}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
          </div>
          {previewCents !== undefined ? <span className="text-sm text-muted-foreground">= {previewCents ?? "needs market price"}</span> : null}
        </div>
      )}
      {err(`${prefix}.asking`) || err(`${prefix}.markupPct`) ? (
        <p className="text-xs font-medium text-destructive">{err(`${prefix}.asking`) ?? err(`${prefix}.markupPct`)}</p>
      ) : null}
    </div>
  );
}

/** Turn a draft into the schema's input shape (strings → validated on submit). */
export function cardPayload(c: CardDraft) {
  return { ...c, setCode: c.setCode || null, number: c.number || null, rarity: c.rarity || null, imageUrl: c.imageUrl || null };
}
export function conditionPayload(c: ConditionDraft) {
  return { ...c, grader: c.grader || null, gradeLabel: c.gradeLabel || null, certNumber: c.certNumber || null };
}
