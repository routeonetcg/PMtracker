-- =====================================================================
-- Phase 2 — prices, history, alerts: access control and audit rules
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'market_products', 'price_snapshots', 'item_price_history', 'price_alerts', 'alert_events', 'inventory_value_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy "members can do everything" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Audit: alert rules fully; linking a card to a feed and dismissing alerts.
create trigger price_alerts_activity after insert or update or delete on public.price_alerts
  for each row execute function public.log_activity();
create trigger market_products_activity after insert or delete on public.market_products
  for each row execute function public.log_activity();
create trigger alert_events_activity after update on public.alert_events
  for each row execute function public.log_activity();

-- The daily price job updates every card's market price. Those automatic
-- refreshes would bury real edits in the activity log, so skip them when no
-- user is signed in and only the market fields changed.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  diff jsonb := '{}'::jsonb;
  k text;
  system_market_keys text[] := array['market_cents', 'market_source', 'market_updated_at'];
  only_market boolean := true;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_row) loop
      if k <> 'updated_at' and (old_row -> k) is distinct from (new_row -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_row -> k, new_row -> k));
        if not (k = any (system_market_keys)) then
          only_market := false;
        end if;
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
    if only_market and (select auth.uid()) is null and tg_table_name = 'inventory_items' then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    diff := new_row;
  else
    diff := old_row;
  end if;

  insert into public.activity_log (actor, table_name, row_id, action, changes)
  values (
    (select auth.uid()),
    tg_table_name,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    lower(tg_op),
    diff
  );
  return coalesce(new, old);
end;
$$;

alter table public.settings
  add constraint settings_alert_window_range check (alert_window_days between 1 and 365),
  add constraint settings_eur_rate_positive check (eur_usd_ppm > 0);
alter table public.price_alerts
  add constraint price_alerts_shape check (
    (kind = 'move_pct' and threshold_bps > 0 and window_days between 1 and 365)
    or (kind in ('above', 'below') and target_cents > 0)
  );
alter table public.price_snapshots add constraint price_snapshots_non_negative check (price_cents >= 0 and native_cents >= 0);
alter table public.item_price_history add constraint item_price_history_non_negative check (price_cents >= 0);

create index if not exists inventory_items_market_product_idx on public.inventory_items (market_product_id);
create index if not exists item_price_history_item_idx on public.item_price_history (item_id, on_date desc);
