import { z } from "zod";
import { parseDollars, parsePercentToBps } from "@/lib/money";
import {
  CHANNELS,
  EDITABLE_STATUSES,
  EXPENSE_CATEGORIES,
  GRADERS,
  keys,
  LANGUAGES,
  LOCATIONS,
  PAYMENT_METHODS,
  RAW_CONDITIONS,
  VARIANTS,
} from "@/lib/labels";

/**
 * Shared form schemas. Forms send money as the dollar string the user typed
 * ("35", "1,250.50"); schemas turn it into integer cents. The same schema runs
 * in the browser (instant errors) and in the server action (never trust the client).
 */

const tuple = <T extends string>(arr: T[]) => arr as [T, ...T[]];

export const dollars = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const c = parseDollars(v);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 12.50` });
        return z.NEVER;
      }
      if (c < 0) {
        ctx.addIssue({ code: "custom", message: `${label} can't be negative` });
        return z.NEVER;
      }
      return c;
    });

/** Optional money: "" → null. */
export const optionalDollars = (label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const c = parseDollars(v);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 12.50` });
        return z.NEVER;
      }
      if (c < 0) {
        ctx.addIssue({ code: "custom", message: `${label} can't be negative` });
        return z.NEVER;
      }
      return c;
    });

/** Money that defaults to 0 when blank. */
export const dollarsOrZero = (label: string) => optionalDollars(label).transform((v) => v ?? 0);

export const percentBps = (label: string, { min = -10000, max = 100000 } = {}) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const b = parsePercentToBps(v);
      if (b === null || b < min || b > max) {
        ctx.addIssue({ code: "custom", message: `${label}: enter a percentage` });
        return z.NEVER;
      }
      return b;
    });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const optionalUuid = z
  .string()
  .uuid()
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const cardSchema = z.object({
  name: z.string().trim().min(1, "Card name is required").max(200),
  setName: z.string().trim().min(1, "Set is required").max(200),
  setCode: optionalText,
  number: optionalText,
  language: z.enum(tuple(keys(LANGUAGES))),
  rarity: optionalText,
  variants: z.array(z.enum(tuple(keys(VARIANTS)))).default([]),
  imageUrl: z
    .string()
    .trim()
    .url("Image must be a link")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const conditionSchema = z
  .object({
    conditionType: z.enum(["raw", "graded"]),
    rawCondition: z.enum(tuple(keys(RAW_CONDITIONS))).optional().nullable(),
    grader: z.enum(tuple(keys(GRADERS))).optional().nullable().or(z.literal("")),
    grade: z.string().trim().optional().nullable(),
    gradeLabel: optionalText,
    certNumber: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.conditionType === "raw" && !v.rawCondition) {
      ctx.addIssue({ code: "custom", path: ["rawCondition"], message: "Pick a condition" });
    }
    if (v.conditionType === "graded") {
      if (!v.grader) ctx.addIssue({ code: "custom", path: ["grader"], message: "Pick the grading company" });
      const g = Number(v.grade);
      if (!v.grade || !Number.isFinite(g) || g < 1 || g > 10 || (g * 2) % 1 !== 0) {
        ctx.addIssue({ code: "custom", path: ["grade"], message: "Grade is 1–10 in half steps" });
      }
    }
  })
  .transform((v) => ({
    conditionType: v.conditionType,
    rawCondition: v.conditionType === "raw" ? (v.rawCondition ?? null) : null,
    grader: v.conditionType === "graded" ? ((v.grader || null) as keyof typeof GRADERS | null) : null,
    grade: v.conditionType === "graded" ? String(Number(v.grade)) : null,
    gradeLabel: v.conditionType === "graded" ? v.gradeLabel : null,
    certNumber: v.conditionType === "graded" ? v.certNumber : null,
  }));

export const askingSchema = z
  .object({
    askingMode: z.enum(["manual", "markup"]),
    asking: optionalDollars("Asking price"),
    markupPct: percentBps("Markup", { min: -9000, max: 100000 }),
  })
  .superRefine((v, ctx) => {
    if (v.askingMode === "markup" && v.markupPct === null) {
      ctx.addIssue({ code: "custom", path: ["markupPct"], message: "Enter a markup %" });
    }
  });

export const itemDetailsSchema = z.object({
  quantity: z.coerce.number().int("Whole number").min(1, "At least 1").max(10000),
  status: z.enum(tuple(EDITABLE_STATUSES)),
  location: z.enum(tuple(keys(LOCATIONS))),
  holderId: optionalUuid,
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .default([])
    .transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]),
  notes: optionalText,
});

export const costSchema = z.object({
  purchase: optionalDollars("Purchase price"),
  fees: dollarsOrZero("Fees"),
  shipping: dollarsOrZero("Shipping"),
  grading: dollarsOrZero("Grading cost"),
});

export const marketSchema = z.object({
  market: optionalDollars("Market price"),
  marketSource: optionalText,
});

/** Edit an existing inventory row (card fields edit the shared card record). */
export const itemEditSchema = z.object({
  card: cardSchema,
  condition: conditionSchema,
  details: itemDetailsSchema,
  cost: costSchema,
  asking: askingSchema,
  market: marketSchema,
  acquiredOn: isoDate,
});
export type ItemEditInput = z.input<typeof itemEditSchema>;

/** One card line of a purchase / bulk lot. */
export const lotLineSchema = z.object({
  card: cardSchema,
  condition: conditionSchema,
  quantity: z.coerce.number().int().min(1, "At least 1").max(10000),
  sharePct: percentBps("Share", { min: 0, max: 10000 }),
  unitMarket: optionalDollars("Market price"),
  manualPrice: optionalDollars("Card price"),
  asking: askingSchema,
  location: z.enum(tuple(keys(LOCATIONS))),
  tags: z.array(z.string()).default([]),
  notes: optionalText,
});

export const purchaseSchema = z
  .object({
    acquiredOn: isoDate,
    source: optionalText,
    channel: z.enum(tuple(keys(CHANNELS))).optional().nullable(),
    eventId: optionalUuid,
    paidByHolderId: optionalUuid,
    holderId: optionalUuid,
    /** Blank price = cost unknown for now ("cost missing"). */
    price: optionalDollars("Total price"),
    fees: dollarsOrZero("Fees"),
    shipping: dollarsOrZero("Shipping"),
    splitMethod: z.enum(["percent", "market_value", "manual", "even"]),
    notes: optionalText,
    lines: z.array(lotLineSchema).min(1, "Add at least one card").max(500),
  })
  .superRefine((v, ctx) => {
    if (v.price === null || v.lines.length < 2) return;
    if (v.splitMethod === "percent") {
      const total = v.lines.reduce((a, l) => a + (l.sharePct ?? 0), 0);
      if (total !== 10000) ctx.addIssue({ code: "custom", path: ["lines"], message: `Shares add up to ${total / 100}% — they must total 100%` });
    }
    if (v.splitMethod === "market_value" && v.lines.some((l) => l.unitMarket === null)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Every card needs a market price to split by market value" });
    }
    if (v.splitMethod === "manual") {
      const total = v.lines.reduce((a, l) => a + (l.manualPrice ?? 0), 0);
      if (v.lines.some((l) => l.manualPrice === null) || total !== v.price) {
        ctx.addIssue({ code: "custom", path: ["lines"], message: "Card prices must add up to the total price" });
      }
    }
  });
export type PurchaseInput = z.input<typeof purchaseSchema>;

export const saleSchema = z
  .object({
    soldOn: isoDate,
    channel: z.enum(tuple(keys(CHANNELS))),
    eventId: optionalUuid,
    price: dollars("Sale price"),
    platformFees: dollarsOrZero("Platform fees"),
    shippingCost: dollarsOrZero("Shipping cost"),
    paymentMethod: z.enum(tuple(keys(PAYMENT_METHODS))),
    soldByPartnerId: z.string().uuid("Pick who made the sale"),
    receivedByHolderId: optionalUuid,
    split: z.enum(["weight", "manual", "even"]).default("weight"),
    buyerNote: optionalText,
    lines: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          quantity: z.coerce.number().int().min(1),
          manualPrice: optionalDollars("Line price"),
        }),
      )
      .min(1, "Pick at least one card"),
  })
  .superRefine((v, ctx) => {
    const ids = v.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "A card is in the sale twice" });
    if (v.split === "manual" && v.lines.length > 1) {
      const total = v.lines.reduce((a, l) => a + (l.manualPrice ?? 0), 0);
      if (v.lines.some((l) => l.manualPrice === null) || total !== v.price) {
        ctx.addIssue({ code: "custom", path: ["lines"], message: "Card prices must add up to the sale price" });
      }
    }
  });
export type SaleFormInput = z.input<typeof saleSchema>;

export const tradeSchema = z
  .object({
    tradedOn: isoDate,
    channel: z.enum(tuple(keys(CHANNELS))),
    eventId: optionalUuid,
    partnerId: z.string().uuid("Pick who made the trade"),
    holderId: optionalUuid,
    cashIn: dollarsOrZero("Cash received"),
    cashOut: dollarsOrZero("Cash paid"),
    paymentMethod: z.enum(tuple(keys(PAYMENT_METHODS))).default("cash"),
    counterparty: optionalText,
    notes: optionalText,
    out: z.array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        agreedValue: dollars("Trade value"),
      }),
    ),
    in: z.array(
      z.object({
        card: cardSchema,
        condition: conditionSchema,
        quantity: z.coerce.number().int().min(1).max(10000),
        agreedValue: dollars("Trade value"),
        location: z.enum(tuple(keys(LOCATIONS))),
        asking: askingSchema,
        unitMarket: optionalDollars("Market price"),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.out.length === 0 && v.in.length === 0) ctx.addIssue({ code: "custom", path: ["out"], message: "Add cards going out or coming in" });
  });
export type TradeFormInput = z.input<typeof tradeSchema>;

export const expenseSchema = z.object({
  spentOn: isoDate,
  category: z.enum(tuple(keys(EXPENSE_CATEGORIES))),
  amount: dollars("Amount").refine((c) => c > 0, "Amount must be more than $0"),
  description: z.string().trim().min(1, "Add a short description").max(300),
  eventId: optionalUuid,
  paidByHolderId: optionalUuid,
});
export type ExpenseFormInput = z.input<typeof expenseSchema>;

export const bulkEditSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one card"),
  status: z.enum(tuple(EDITABLE_STATUSES)).optional(),
  location: z.enum(tuple(keys(LOCATIONS))).optional(),
  holderId: z.string().uuid().optional(),
  addTags: z.array(z.string().trim().min(1).max(40)).optional(),
  removeTags: z.array(z.string().trim().min(1).max(40)).optional(),
  markupPct: percentBps("Markup", { min: -9000, max: 100000 }).optional(),
});
export type BulkEditInput = z.input<typeof bulkEditSchema>;

export const settingsSchema = z.object({
  defaultMarkupPct: percentBps("Default markup", { min: -9000, max: 100000 }).refine((v) => v !== null, "Required"),
  roundAskingTo: dollarsOrZero("Round asking to"),
  staleDays: z.coerce.number().int().min(1).max(365),
  slowMoverDays: z.coerce.number().int().min(1).max(3650),
  ebayFeePct: percentBps("eBay fee", { min: 0, max: 5000 }).refine((v) => v !== null, "Required"),
  ebayFeeFixed: dollarsOrZero("eBay fixed fee"),
  defaultAlertPct: percentBps("Default alert", { min: 0, max: 100000 }).refine((v) => v !== null, "Required (0 turns it off)"),
  alertWindowDays: z.coerce.number().int().min(1).max(365),
});

/** Flatten zod issues into { "lines.0.card.name": "message" }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
