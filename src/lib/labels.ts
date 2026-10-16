/** Human labels for every enum, shared by forms, tables and CSV. */

export const LANGUAGES = { EN: "English", JP: "Japanese" } as const;
export type Language = keyof typeof LANGUAGES;

export const RAW_CONDITIONS = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
} as const;
export type RawCondition = keyof typeof RAW_CONDITIONS;

export const GRADERS = { PSA: "PSA", BGS: "BGS", CGC: "CGC", TAG: "TAG" } as const;
export type Grader = keyof typeof GRADERS;

export const VARIANTS = {
  holo: "Holo",
  reverse_holo: "Reverse Holo",
  stamp: "Stamp",
  first_edition: "1st Edition",
  promo: "Promo",
  full_art: "Full Art",
  alt_art: "Alt Art",
  shadowless: "Shadowless",
  error: "Error",
} as const;
export type Variant = keyof typeof VARIANTS;

export const STATUSES = {
  in_stock: "In Stock",
  listed: "Listed",
  on_hold: "On Hold",
  in_grading: "In Grading",
  sold: "Sold",
  traded: "Traded",
  personal: "Personal Collection",
} as const;
export type ItemStatus = keyof typeof STATUSES;

/** Statuses that count as sellable business inventory. */
export const ACTIVE_STATUSES: ItemStatus[] = ["in_stock", "listed", "on_hold", "in_grading"];
/** Statuses you can pick by hand (sold/traded come from recording a sale/trade). */
export const EDITABLE_STATUSES: ItemStatus[] = ["in_stock", "listed", "on_hold", "in_grading", "personal"];

export const STATUS_BADGE: Record<ItemStatus, "success" | "info" | "warning" | "muted" | "secondary" | "outline"> = {
  in_stock: "success",
  listed: "info",
  on_hold: "warning",
  in_grading: "secondary",
  sold: "muted",
  traded: "muted",
  personal: "outline",
};

export const LOCATIONS = {
  binder: "Binder",
  display_case: "Display Case",
  show_box: "Show Box",
  at_grader: "At Grader",
  other: "Other",
} as const;
export type Location = keyof typeof LOCATIONS;

export const CHANNELS = {
  card_show: "Card Show",
  instagram: "Instagram",
  ebay: "eBay",
  local: "Local",
  other: "Other",
} as const;
export type Channel = keyof typeof CHANNELS;

export const PAYMENT_METHODS = {
  cash: "Cash",
  venmo: "Venmo",
  paypal: "PayPal",
  zelle: "Zelle",
  card: "Card",
  other: "Other",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const EXPENSE_CATEGORIES = {
  show_table_fee: "Show table fee",
  supplies: "Supplies",
  grading: "Grading",
  shipping: "Shipping",
  travel: "Travel",
  marketing: "Marketing",
  subscriptions: "Subscriptions",
  other: "Other",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export const RARITY_SUGGESTIONS = [
  "Common",
  "Uncommon",
  "Rare",
  "Holo Rare",
  "Ultra Rare",
  "Full Art",
  "Secret Rare",
  "Hyper Rare (Gold)",
  "Illustration Rare",
  "Special Illustration Rare",
  "Art Rare (AR)",
  "Special Art Rare (SAR)",
  "Character Super Rare (CSR)",
  "Character Holo Rare (CHR)",
  "Promo",
];

export function keys<T extends Record<string, string>>(o: T): (keyof T & string)[] {
  return Object.keys(o) as (keyof T & string)[];
}

export type ConditionFields = {
  conditionType: "raw" | "graded";
  rawCondition: RawCondition | null;
  grader: Grader | null;
  grade: string | null;
  gradeLabel: string | null;
};

/** "NM", "PSA 10", "BGS 9.5 Black Label". */
export function conditionLabel(c: ConditionFields): string {
  if (c.conditionType === "graded") {
    const grade = c.grade ? String(Number(c.grade)) : "?";
    return [c.grader, grade, c.gradeLabel].filter(Boolean).join(" ");
  }
  return c.rawCondition ?? "Raw";
}
