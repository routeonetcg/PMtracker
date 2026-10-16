ALTER TABLE "acquisitions" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "table_fee_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "table_fee_paid_by_holder_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cash_holder_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "client_ref" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "card_fee_bps" integer DEFAULT 260 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "card_fee_fixed_cents" bigint DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_table_fee_paid_by_holder_id_holders_id_fk" FOREIGN KEY ("table_fee_paid_by_holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cash_holder_id_holders_id_fk" FOREIGN KEY ("cash_holder_id") REFERENCES "public"."holders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_ref_unique" UNIQUE("client_ref");