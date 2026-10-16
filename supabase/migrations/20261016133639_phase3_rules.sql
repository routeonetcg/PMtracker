-- =====================================================================
-- Phase 3 — shows / events
-- =====================================================================
alter table public.events
  add constraint events_dates_order check (ends_on is null or ends_on >= starts_on),
  add constraint events_money_non_negative check (table_fee_cents >= 0 and float_cents >= 0 and coalesce(counted_cash_cents, 0) >= 0);

alter table public.events
  add constraint events_table_fee_expense_fk foreign key (table_fee_expense_id) references public.expenses (id) on delete set null;

alter table public.settings
  add constraint settings_card_fee_non_negative check (card_fee_bps >= 0 and card_fee_fixed_cents >= 0);

create index if not exists sales_event_idx on public.sales (event_id);
create index if not exists trades_event_idx on public.trades (event_id);
create index if not exists expenses_event_idx on public.expenses (event_id);
create index if not exists acquisitions_event_idx on public.acquisitions (event_id);

-- Only one show can be live at a time (Show Mode and the home button point at it).
create unique index if not exists events_one_live on public.events ((true)) where status = 'live';
