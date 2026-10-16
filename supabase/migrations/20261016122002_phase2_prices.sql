CREATE TYPE "public"."alert_kind" AS ENUM('move_pct', 'above', 'below');--> statement-breakpoint
CREATE TYPE "public"."market_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."price_provider" AS ENUM('tcgdex', 'pricecharting');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"alert_id" uuid,
	"kind" "alert_kind" NOT NULL,
	"on_date" date NOT NULL,
	"from_cents" bigint,
	"to_cents" bigint NOT NULL,
	"change_bps" integer,
	"message" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_value_snapshots" (
	"on_date" date PRIMARY KEY NOT NULL,
	"cost_cents" bigint NOT NULL,
	"market_cents" bigint NOT NULL,
	"priced_cost_cents" bigint NOT NULL,
	"units" integer NOT NULL,
	"unpriced_rows" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"price_cents" bigint NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "item_price_history_daily" UNIQUE("item_id","on_date")
);
--> statement-breakpoint
CREATE TABLE "market_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "price_provider" NOT NULL,
	"external_id" text NOT NULL,
	"price_field" text NOT NULL,
	"label" text NOT NULL,
	"product_name" text,
	"set_name" text,
	"image_url" text,
	"url" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"last_price_cents" bigint,
	"last_native_cents" bigint,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "market_products_unique" UNIQUE("provider","external_id","price_field")
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"threshold_bps" integer,
	"window_days" integer DEFAULT 7 NOT NULL,
	"target_cents" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"price_cents" bigint NOT NULL,
	"native_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_snapshots_daily" UNIQUE("product_id","on_date")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "market_mode" "market_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "market_product_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "alert_window_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "eur_usd_ppm" integer DEFAULT 1080000 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "eur_usd_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "price_job_last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "price_job_last_result" jsonb;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_price_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."price_alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_price_history" ADD CONSTRAINT "item_price_history_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_product_id_market_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."market_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_open_idx" ON "alert_events" USING btree ("acknowledged_at");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_market_product_id_market_products_id_fk" FOREIGN KEY ("market_product_id") REFERENCES "public"."market_products"("id") ON DELETE set null ON UPDATE no action;