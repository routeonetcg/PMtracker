import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
// Supabase's auth.users (managed by Supabase, referenced only, never migrated by us).
import { authUsers } from "drizzle-orm/supabase";


/** All money columns: integer cents, read back as JS numbers. */
const cents = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const createdBy = () => uuid("created_by").default(sql`auth.uid()`);

// ---------------------------------------------------------------- enums
export const languageEnum = pgEnum("card_language", ["EN", "JP"]);
export const conditionTypeEnum = pgEnum("condition_type", ["raw", "graded"]);
export const rawConditionEnum = pgEnum("raw_condition", ["NM", "LP", "MP", "HP", "DMG"]);
export const graderEnum = pgEnum("grader", ["PSA", "BGS", "CGC", "TAG"]);
export const variantEnum = pgEnum("card_variant", [
  "holo",
  "reverse_holo",
  "stamp",
  "first_edition",
  "promo",
  "full_art",
  "alt_art",
  "shadowless",
  "error",
]);
export const itemStatusEnum = pgEnum("item_status", [
  "in_stock",
  "listed",
  "on_hold",
  "in_grading",
  "sold",
  "traded",
  "personal",
]);
export const locationEnum = pgEnum("item_location", ["binder", "display_case", "show_box", "at_grader", "other"]);
export const askingModeEnum = pgEnum("asking_mode", ["manual", "markup"]);
export const channelEnum = pgEnum("sales_channel", ["card_show", "instagram", "ebay", "local", "other"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "venmo", "paypal", "zelle", "card", "other"]);
export const acquisitionKindEnum = pgEnum("acquisition_kind", ["purchase", "bulk_lot", "trade_in", "opening"]);
export const lotSplitEnum = pgEnum("lot_split_method", ["percent", "market_value", "manual", "even"]);
export const saleSplitEnum = pgEnum("sale_split_method", ["weight", "manual", "even"]);
export const expenseCategoryEnum = pgEnum("expense_category", [
  "show_table_fee",
  "supplies",
  "grading",
  "shipping",
  "travel",
  "marketing",
  "subscriptions",
  "other",
]);
export const holderKindEnum = pgEnum("holder_kind", ["partner", "business"]);
export const tradeDirectionEnum = pgEnum("trade_direction", ["in", "out"]);
export const eventStatusEnum = pgEnum("event_status", ["planned", "live", "closed"]);
export const priceProviderEnum = pgEnum("price_provider", ["tcgdex", "pricecharting"]);
export const marketModeEnum = pgEnum("market_mode", ["auto", "manual"]);
export const alertKindEnum = pgEnum("alert_kind", ["move_pct", "above", "below"]);

// ---------------------------------------------------------------- people
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .unique()
    .references(() => authUsers.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  splitBps: integer("split_bps").notNull().default(5000),
  color: text("color").notNull().default("#F5B700"),
  createdAt: createdAt(),
});

/** Who physically holds money or cards: each partner, or the business account. */
export const holders = pgTable("holders", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: holderKindEnum("kind").notNull(),
  partnerId: uuid("partner_id")
    .unique()
    .references(() => partners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  defaultMarkupBps: integer("default_markup_bps").notNull().default(1500),
  roundAskingToCents: integer("round_asking_to_cents").notNull().default(100),
  staleDays: integer("stale_days").notNull().default(7),
  slowMoverDays: integer("slow_mover_days").notNull().default(60),
  defaultAlertBps: integer("default_alert_bps").notNull().default(1500),
  ebayFeeBps: integer("ebay_fee_bps").notNull().default(1325),
  ebayFeeFixedCents: cents("ebay_fee_fixed_cents").notNull().default(40),
  /** Default alert: flag any card whose market moves ± this much over `alertWindowDays`. 0 = off. */
  alertWindowDays: integer("alert_window_days").notNull().default(7),
  /** EUR→USD rate in parts per million (1.08 = 1080000), refreshed by the price job. */
  eurUsdPpm: integer("eur_usd_ppm").notNull().default(1080000),
  eurUsdUpdatedAt: timestamp("eur_usd_updated_at", { withTimezone: true }),
  priceJobLastRunAt: timestamp("price_job_last_run_at", { withTimezone: true }),
  priceJobLastResult: jsonb("price_job_last_result"),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- events
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startsOn: date("starts_on").notNull(),
  location: text("location"),
  tableFeeCents: cents("table_fee_cents").notNull().default(0),
  floatCents: cents("float_cents").notNull().default(0),
  status: eventStatusEnum("status").notNull().default("planned"),
  countedCashCents: cents("counted_cash_cents"),
  notes: text("notes"),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

// ---------------------------------------------------------------- market prices
/** One priced thing at a provider: a card + which price (e.g. TCGplayer holofoil market, PriceCharting PSA 10). */
export const marketProducts = pgTable(
  "market_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: priceProviderEnum("provider").notNull(),
    externalId: text("external_id").notNull(),
    priceField: text("price_field").notNull(),
    label: text("label").notNull(),
    productName: text("product_name"),
    setName: text("set_name"),
    imageUrl: text("image_url"),
    url: text("url"),
    currency: text("currency").notNull().default("USD"),
    lastPriceCents: cents("last_price_cents"),
    lastNativeCents: cents("last_native_cents"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    createdBy: createdBy(),
  },
  (t) => [unique("market_products_unique").on(t.provider, t.externalId, t.priceField)],
);

/** Daily price per market product (USD cents, plus the provider's native amount). */
export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => marketProducts.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    priceCents: cents("price_cents").notNull(),
    nativeCents: cents("native_cents").notNull(),
    currency: text("currency").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("price_snapshots_daily").on(t.productId, t.onDate)],
);

// ---------------------------------------------------------------- catalog
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    setName: text("set_name").notNull(),
    setCode: text("set_code"),
    number: text("number"),
    language: languageEnum("language").notNull().default("EN"),
    rarity: text("rarity"),
    variants: variantEnum("variants").array().notNull().default(sql`'{}'::card_variant[]`),
    imageUrl: text("image_url"),
    createdAt: createdAt(),
    createdBy: createdBy(),
  },
  (t) => [
    index("cards_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("cards_set_trgm").using("gin", sql`${t.setName} gin_trgm_ops`),
  ],
);

export const acquisitions = pgTable("acquisitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: acquisitionKindEnum("kind").notNull(),
  acquiredOn: date("acquired_on").notNull(),
  source: text("source"),
  channel: channelEnum("channel"),
  priceCents: cents("price_cents"),
  feesCents: cents("fees_cents").notNull().default(0),
  shippingCents: cents("shipping_cents").notNull().default(0),
  splitMethod: lotSplitEnum("split_method"),
  paidByHolderId: uuid("paid_by_holder_id").references(() => holders.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  tradeId: uuid("trade_id"),
  notes: text("notes"),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemNo: integer("item_no").generatedAlwaysAsIdentity().notNull().unique(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
    conditionType: conditionTypeEnum("condition_type").notNull().default("raw"),
    rawCondition: rawConditionEnum("raw_condition"),
    grader: graderEnum("grader"),
    grade: numeric("grade", { precision: 3, scale: 1 }),
    gradeLabel: text("grade_label"),
    certNumber: text("cert_number"),
    status: itemStatusEnum("status").notNull().default("in_stock"),
    location: locationEnum("location").notNull().default("binder"),
    holderId: uuid("holder_id").references(() => holders.id),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),

    // Cost basis components (row totals). purchase NULL = not entered yet.
    purchaseCents: cents("purchase_cents"),
    feesCents: cents("fees_cents").notNull().default(0),
    shippingCents: cents("shipping_cents").notNull().default(0),
    gradingCents: cents("grading_cents").notNull().default(0),
    acquisitionId: uuid("acquisition_id").references(() => acquisitions.id, { onDelete: "set null" }),
    acquiredOn: date("acquired_on").notNull().default(sql`current_date`),
    parentItemId: uuid("parent_item_id"),

    // Asking price
    askingMode: askingModeEnum("asking_mode").notNull().default("manual"),
    askingCents: cents("asking_cents"),
    markupBps: integer("markup_bps"),

    // Market price (per copy). Manual for now; provider-fed in phase 2.
    marketCents: cents("market_cents"),
    marketSource: text("market_source"),
    marketUpdatedAt: timestamp("market_updated_at", { withTimezone: true }),
    /** auto = follow the linked price feed; manual = a hand-entered override wins. */
    marketMode: marketModeEnum("market_mode").notNull().default("manual"),
    marketProductId: uuid("market_product_id").references(() => marketProducts.id, { onDelete: "set null" }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    createdBy: createdBy(),
  },
  (t) => [index("inventory_items_card_idx").on(t.cardId), index("inventory_items_status_idx").on(t.status)],
);

export const itemPhotos = pgTable("item_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

// ---------------------------------------------------------------- sales
export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleNo: integer("sale_no").generatedAlwaysAsIdentity().notNull().unique(),
  soldOn: date("sold_on").notNull(),
  channel: channelEnum("channel").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  priceCents: cents("price_cents").notNull(),
  platformFeesCents: cents("platform_fees_cents").notNull().default(0),
  shippingCostCents: cents("shipping_cost_cents").notNull().default(0),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  soldByPartnerId: uuid("sold_by_partner_id").references(() => partners.id),
  receivedByHolderId: uuid("received_by_holder_id").references(() => holders.id),
  splitMethod: saleSplitEnum("split_method").notNull().default("weight"),
  buyerNote: text("buyer_note"),
  notes: text("notes"),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

export const saleLines = pgTable("sale_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  quantity: integer("quantity").notNull(),
  priceCents: cents("price_cents").notNull(),
  feesCents: cents("fees_cents").notNull().default(0),
  shippingCents: cents("shipping_cents").notNull().default(0),
  costBasisCents: cents("cost_basis_cents").notNull(),
  costMissing: boolean("cost_missing").notNull().default(false),
});

// ---------------------------------------------------------------- trades
export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeNo: integer("trade_no").generatedAlwaysAsIdentity().notNull().unique(),
  tradedOn: date("traded_on").notNull(),
  channel: channelEnum("channel").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  partnerId: uuid("partner_id").references(() => partners.id),
  holderId: uuid("holder_id").references(() => holders.id),
  cashInCents: cents("cash_in_cents").notNull().default(0),
  cashOutCents: cents("cash_out_cents").notNull().default(0),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
  counterparty: text("counterparty"),
  notes: text("notes"),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

export const tradeLines = pgTable("trade_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeId: uuid("trade_id")
    .notNull()
    .references(() => trades.id, { onDelete: "cascade" }),
  direction: tradeDirectionEnum("direction").notNull(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  quantity: integer("quantity").notNull(),
  agreedValueCents: cents("agreed_value_cents").notNull(),
  /** Out: cost basis given up. In: cost basis assigned. */
  costBasisCents: cents("cost_basis_cents").notNull(),
  costMissing: boolean("cost_missing").notNull().default(false),
});

// ---------------------------------------------------------------- expenses
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  spentOn: date("spent_on").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  amountCents: cents("amount_cents").notNull(),
  description: text("description").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  paidByHolderId: uuid("paid_by_holder_id").references(() => holders.id),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

// ---------------------------------------------------------------- price history & alerts
/** The effective market price of each inventory row per day (feed or manual). Drives charts and alerts. */
export const itemPriceHistory = pgTable(
  "item_price_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    priceCents: cents("price_cents").notNull(),
    source: text("source").notNull(),
  },
  (t) => [unique("item_price_history_daily").on(t.itemId, t.onDate)],
);

export const priceAlerts = pgTable("price_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  kind: alertKindEnum("kind").notNull(),
  /** move_pct: ± basis points over windowDays. */
  thresholdBps: integer("threshold_bps"),
  windowDays: integer("window_days").notNull().default(7),
  /** above / below: target market price per copy. */
  targetCents: cents("target_cents"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: createdAt(),
  createdBy: createdBy(),
});

/** A fired alert. Shown on the dashboard until someone dismisses it. */
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    /** null = the default ±X% rule from settings. */
    alertId: uuid("alert_id").references(() => priceAlerts.id, { onDelete: "set null" }),
    kind: alertKindEnum("kind").notNull(),
    onDate: date("on_date").notNull(),
    fromCents: cents("from_cents"),
    toCents: cents("to_cents").notNull(),
    changeBps: integer("change_bps"),
    message: text("message").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by"),
    createdAt: createdAt(),
  },
  (t) => [index("alert_events_open_idx").on(t.acknowledgedAt)],
);

/** Daily totals for the "inventory value over time" chart. */
export const inventoryValueSnapshots = pgTable("inventory_value_snapshots", {
  onDate: date("on_date").primaryKey(),
  costCents: cents("cost_cents").notNull(),
  marketCents: cents("market_cents").notNull(),
  pricedCostCents: cents("priced_cost_cents").notNull(),
  units: integer("units").notNull(),
  unpricedRows: integer("unpriced_rows").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- audit
export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: uuid("actor"),
    tableName: text("table_name").notNull(),
    rowId: text("row_id"),
    action: text("action").notNull(),
    changes: jsonb("changes"),
  },
  (t) => [index("activity_log_at_idx").on(t.at), index("activity_log_row_idx").on(t.tableName, t.rowId)],
);
