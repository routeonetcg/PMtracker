CREATE TYPE "public"."acquisition_kind" AS ENUM('purchase', 'bulk_lot', 'trade_in', 'opening');--> statement-breakpoint
CREATE TYPE "public"."asking_mode" AS ENUM('manual', 'markup');--> statement-breakpoint
CREATE TYPE "public"."sales_channel" AS ENUM('card_show', 'instagram', 'ebay', 'local', 'other');--> statement-breakpoint
CREATE TYPE "public"."condition_type" AS ENUM('raw', 'graded');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('planned', 'live', 'closed');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('show_table_fee', 'supplies', 'grading', 'shipping', 'travel', 'marketing', 'subscriptions', 'other');--> statement-breakpoint
CREATE TYPE "public"."grader" AS ENUM('PSA', 'BGS', 'CGC', 'TAG');--> statement-breakpoint
CREATE TYPE "public"."holder_kind" AS ENUM('partner', 'business');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('in_stock', 'listed', 'on_hold', 'in_grading', 'sold', 'traded', 'personal');--> statement-breakpoint
CREATE TYPE "public"."card_language" AS ENUM('EN', 'JP');--> statement-breakpoint
CREATE TYPE "public"."item_location" AS ENUM('binder', 'display_case', 'show_box', 'at_grader', 'other');--> statement-breakpoint
CREATE TYPE "public"."lot_split_method" AS ENUM('percent', 'market_value', 'manual', 'even');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'venmo', 'paypal', 'zelle', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."raw_condition" AS ENUM('NM', 'LP', 'MP', 'HP', 'DMG');--> statement-breakpoint
CREATE TYPE "public"."sale_split_method" AS ENUM('weight', 'manual', 'even');--> statement-breakpoint
CREATE TYPE "public"."trade_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."card_variant" AS ENUM('holo', 'reverse_holo', 'stamp', 'first_edition', 'promo', 'full_art', 'alt_art', 'shadowless', 'error');--> statement-breakpoint
CREATE TABLE "acquisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "acquisition_kind" NOT NULL,
	"acquired_on" date NOT NULL,
	"source" text,
	"channel" "sales_channel",
	"price_cents" bigint,
	"fees_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"split_method" "lot_split_method",
	"paid_by_holder_id" uuid,
	"partner_id" uuid,
	"event_id" uuid,
	"trade_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" uuid,
	"table_name" text NOT NULL,
	"row_id" text,
	"action" text NOT NULL,
	"changes" jsonb
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"set_name" text NOT NULL,
	"set_code" text,
	"number" text,
	"language" "card_language" DEFAULT 'EN' NOT NULL,
	"rarity" text,
	"variants" "card_variant"[] DEFAULT '{}'::card_variant[] NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"location" text,
	"table_fee_cents" bigint DEFAULT 0 NOT NULL,
	"float_cents" bigint DEFAULT 0 NOT NULL,
	"status" "event_status" DEFAULT 'planned' NOT NULL,
	"counted_cash_cents" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spent_on" date NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"event_id" uuid,
	"paid_by_holder_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "holder_kind" NOT NULL,
	"partner_id" uuid,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "holders_partner_id_unique" UNIQUE("partner_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "inventory_items_item_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"card_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition_type" "condition_type" DEFAULT 'raw' NOT NULL,
	"raw_condition" "raw_condition",
	"grader" "grader",
	"grade" numeric(3, 1),
	"grade_label" text,
	"cert_number" text,
	"status" "item_status" DEFAULT 'in_stock' NOT NULL,
	"location" "item_location" DEFAULT 'binder' NOT NULL,
	"holder_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"purchase_cents" bigint,
	"fees_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"grading_cents" bigint DEFAULT 0 NOT NULL,
	"acquisition_id" uuid,
	"acquired_on" date DEFAULT current_date NOT NULL,
	"parent_item_id" uuid,
	"asking_mode" "asking_mode" DEFAULT 'manual' NOT NULL,
	"asking_cents" bigint,
	"markup_bps" integer,
	"market_cents" bigint,
	"market_source" text,
	"market_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "inventory_items_item_no_unique" UNIQUE("item_no")
);
--> statement-breakpoint
CREATE TABLE "item_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"split_bps" integer DEFAULT 5000 NOT NULL,
	"color" text DEFAULT '#F5B700' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "partners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"price_cents" bigint NOT NULL,
	"fees_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"cost_basis_cents" bigint NOT NULL,
	"cost_missing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "sales_sale_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sold_on" date NOT NULL,
	"channel" "sales_channel" NOT NULL,
	"event_id" uuid,
	"price_cents" bigint NOT NULL,
	"platform_fees_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cost_cents" bigint DEFAULT 0 NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"sold_by_partner_id" uuid,
	"received_by_holder_id" uuid,
	"split_method" "sale_split_method" DEFAULT 'weight' NOT NULL,
	"buyer_note" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "sales_sale_no_unique" UNIQUE("sale_no")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_markup_bps" integer DEFAULT 1500 NOT NULL,
	"round_asking_to_cents" integer DEFAULT 100 NOT NULL,
	"stale_days" integer DEFAULT 7 NOT NULL,
	"slow_mover_days" integer DEFAULT 60 NOT NULL,
	"default_alert_bps" integer DEFAULT 1500 NOT NULL,
	"ebay_fee_bps" integer DEFAULT 1325 NOT NULL,
	"ebay_fee_fixed_cents" bigint DEFAULT 40 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"direction" "trade_direction" NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"agreed_value_cents" bigint NOT NULL,
	"cost_basis_cents" bigint NOT NULL,
	"cost_missing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "trades_trade_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"traded_on" date NOT NULL,
	"channel" "sales_channel" NOT NULL,
	"event_id" uuid,
	"partner_id" uuid,
	"holder_id" uuid,
	"cash_in_cents" bigint DEFAULT 0 NOT NULL,
	"cash_out_cents" bigint DEFAULT 0 NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"counterparty" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "trades_trade_no_unique" UNIQUE("trade_no")
);
--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_paid_by_holder_id_holders_id_fk" FOREIGN KEY ("paid_by_holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_holder_id_holders_id_fk" FOREIGN KEY ("paid_by_holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holders" ADD CONSTRAINT "holders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_holder_id_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_acquisition_id_acquisitions_id_fk" FOREIGN KEY ("acquisition_id") REFERENCES "public"."acquisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_photos" ADD CONSTRAINT "item_photos_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sold_by_partner_id_partners_id_fk" FOREIGN KEY ("sold_by_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_received_by_holder_id_holders_id_fk" FOREIGN KEY ("received_by_holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_lines" ADD CONSTRAINT "trade_lines_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_lines" ADD CONSTRAINT "trade_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_holder_id_holders_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_at_idx" ON "activity_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "activity_log_row_idx" ON "activity_log" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "cards_name_trgm" ON "cards" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cards_set_trgm" ON "cards" USING gin ("set_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "inventory_items_card_idx" ON "inventory_items" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "inventory_items_status_idx" ON "inventory_items" USING btree ("status");