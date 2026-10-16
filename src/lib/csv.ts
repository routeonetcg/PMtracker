import { z } from "zod";
import { centsToInput } from "@/lib/money";
import { GRADERS, keys, LOCATIONS, RAW_CONDITIONS, STATUSES, VARIANTS } from "@/lib/labels";
import { isoDate, optionalDollars, percentBps } from "@/lib/validation";

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export const INVENTORY_COLUMNS = [
  "item_no",
  "name",
  "set",
  "set_code",
  "number",
  "language",
  "rarity",
  "variants",
  "condition",
  "grader",
  "grade",
  "grade_label",
  "cert_number",
  "quantity",
  "status",
  "location",
  "held_by",
  "tags",
  "purchase",
  "fees",
  "shipping",
  "grading",
  "cost_basis",
  "acquired_on",
  "market_each",
  "market_source",
  "market_updated",
  "asking_mode",
  "asking",
  "markup_pct",
  "notes",
] as const;

export const money = (c: number | null | undefined) => (c === null || c === undefined ? "" : centsToInput(c));

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const text = z
  .string()
  .optional()
  .transform((v) => (blank(v) ? null : v!.trim()));

/** One CSV row → validated values for an inventory row. Unknown columns are ignored. */
const importRowObject = z
  .object({
    name: z.string({ error: "name is required" }).trim().min(1, "name is required"),
    set: z.string({ error: "set is required" }).trim().min(1, "set is required"),
    set_code: text,
    number: text,
    language: z
      .string()
      .optional()
      .transform((v) => (v && /^(jp|ja|japanese)$/i.test(v.trim()) ? "JP" : "EN") as "EN" | "JP"),
    rarity: text,
    variants: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const out: (keyof typeof VARIANTS)[] = [];
        for (const raw of (v ?? "").split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
          const key = keys(VARIANTS).find((k) => k === raw.toLowerCase().replace(/[\s-]+/g, "_") || VARIANTS[k].toLowerCase() === raw.toLowerCase());
          if (!key) {
            ctx.addIssue({ code: "custom", message: `unknown variant "${raw}"` });
            return z.NEVER;
          }
          out.push(key);
        }
        return out;
      }),
    condition: text,
    grader: text,
    grade: text,
    grade_label: text,
    cert_number: text,
    quantity: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (blank(v)) return 1;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) {
          ctx.addIssue({ code: "custom", message: "quantity must be a whole number ≥ 1" });
          return z.NEVER;
        }
        return n;
      }),
    status: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (blank(v)) return "in_stock" as const;
        const k = keys(STATUSES).find((s) => s === v!.trim().toLowerCase().replace(/\s+/g, "_") || STATUSES[s].toLowerCase() === v!.trim().toLowerCase());
        if (!k || k === "sold" || k === "traded") {
          ctx.addIssue({ code: "custom", message: `status "${v}" can't be imported (record sales separately)` });
          return z.NEVER;
        }
        return k;
      }),
    location: z
      .string()
      .optional()
      .transform((v) => {
        const k = keys(LOCATIONS).find((l) => l === (v ?? "").trim().toLowerCase().replace(/\s+/g, "_") || LOCATIONS[l].toLowerCase() === (v ?? "").trim().toLowerCase());
        return k ?? "binder";
      }),
    tags: z
      .string()
      .optional()
      .transform((v) => (v ?? "").split(/[;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean)),
    purchase: optionalDollars("purchase"),
    fees: optionalDollars("fees").transform((v) => v ?? 0),
    shipping: optionalDollars("shipping").transform((v) => v ?? 0),
    grading: optionalDollars("grading").transform((v) => v ?? 0),
    acquired_on: isoDate.optional().or(z.literal("").transform(() => undefined)),
    market_each: optionalDollars("market_each"),
    market_source: text,
    asking: optionalDollars("asking"),
    markup_pct: percentBps("markup_pct", { min: -9000, max: 100000 }),
    notes: text,
  })
  .transform((r, ctx) => {
    let conditionType: "raw" | "graded" = "raw";
    let rawCondition: keyof typeof RAW_CONDITIONS | null = "NM";
    let grader: keyof typeof GRADERS | null = null;
    let grade: string | null = null;
    // "PSA 10" in the condition column, or separate grader + grade columns.
    const m = /^(PSA|BGS|CGC|TAG)\s*([\d.]+)$/i.exec(r.condition ?? "");
    const g = (r.grader ?? m?.[1])?.toUpperCase();
    const gradeText = r.grade ?? m?.[2] ?? null;
    if (g) {
      if (!keys(GRADERS).includes(g as keyof typeof GRADERS)) {
        ctx.addIssue({ code: "custom", message: `unknown grader "${g}"` });
        return z.NEVER;
      }
      const n = Number(gradeText);
      if (!gradeText || !Number.isFinite(n) || n < 1 || n > 10 || (n * 2) % 1 !== 0) {
        ctx.addIssue({ code: "custom", message: "graded cards need a grade from 1 to 10" });
        return z.NEVER;
      }
      conditionType = "graded";
      rawCondition = null;
      grader = g as keyof typeof GRADERS;
      grade = String(n);
    } else if (r.condition) {
      const c = r.condition.toUpperCase().replace(/[^A-Z]/g, "");
      const map: Record<string, keyof typeof RAW_CONDITIONS> = { NM: "NM", NEARMINT: "NM", LP: "LP", MP: "MP", HP: "HP", DMG: "DMG", DAMAGED: "DMG" };
      if (!map[c]) {
        ctx.addIssue({ code: "custom", message: `condition "${r.condition}" should be NM, LP, MP, HP, DMG or e.g. "PSA 10"` });
        return z.NEVER;
      }
      rawCondition = map[c];
    }
    return { ...r, conditionType, rawCondition, grader, grade };
  });

/** Missing columns are treated as blank cells. */
export const importRowSchema = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const filled: Record<string, unknown> = Object.fromEntries(INVENTORY_COLUMNS.map((c) => [c, ""]));
  for (const [k, val] of Object.entries(v)) filled[k] = val ?? "";
  return filled;
}, importRowObject);
export type ImportRow = z.output<typeof importRowSchema>;
