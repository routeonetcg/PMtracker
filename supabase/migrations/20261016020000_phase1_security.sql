-- =====================================================================
-- Route One TCG HQ — access control, audit log, storage
-- Only the partner accounts listed in public.partners can read or write.
-- =====================================================================

-- ---------- membership check ---------------------------------------------
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partners p where p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

-- When a partner's auth account is created, link it to their partners row by email.
create or replace function public.link_partner_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.partners set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_partner on auth.users;
create trigger on_auth_user_created_link_partner
  after insert on auth.users
  for each row execute function public.link_partner_user();

-- ---------- updated_at ----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- activity log --------------------------------------------------
-- Every insert/update/delete on business tables is recorded with who did it.
-- Updates store only the columns that changed: {"col": [old, new]}.
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
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_row) loop
      if k <> 'updated_at' and (old_row -> k) is distinct from (new_row -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_row -> k, new_row -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
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

do $$
declare
  t text;
begin
  foreach t in array array[
    'partners', 'holders', 'settings', 'events', 'cards', 'acquisitions', 'inventory_items',
    'item_photos', 'sales', 'sale_lines', 'trades', 'trade_lines', 'expenses'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t || '_activity', t
    );
  end loop;
end;
$$;

-- ---------- row level security --------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'partners', 'holders', 'settings', 'events', 'cards', 'acquisitions', 'inventory_items',
    'item_photos', 'sales', 'sale_lines', 'trades', 'trade_lines', 'expenses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy "members can do everything" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))',
      t
    );
  end loop;
end;
$$;

-- The activity log is read-only for members; only the trigger writes to it.
alter table public.activity_log enable row level security;
alter table public.activity_log force row level security;
create policy "members can read activity" on public.activity_log
  for select to authenticated using ((select public.is_member()));

-- Nobody signed out should ever touch these tables.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------- card photo storage --------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-photos', 'card-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "members read card photos" on storage.objects
  for select to authenticated using (bucket_id = 'card-photos' and (select public.is_member()));
create policy "members upload card photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'card-photos' and (select public.is_member()));
create policy "members update card photos" on storage.objects
  for update to authenticated using (bucket_id = 'card-photos' and (select public.is_member()));
create policy "members delete card photos" on storage.objects
  for delete to authenticated using (bucket_id = 'card-photos' and (select public.is_member()));

-- ---------- singleton settings row -------------------------------------------
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings add constraint settings_singleton check (id = 1);

-- ---------- data sanity checks --------------------------------------------------
alter table public.inventory_items
  add constraint inventory_quantity_positive check (quantity >= 1),
  add constraint inventory_raw_has_condition check (condition_type <> 'raw' or raw_condition is not null),
  add constraint inventory_graded_has_grade check (condition_type <> 'graded' or (grader is not null and grade is not null)),
  add constraint inventory_grade_range check (grade is null or (grade >= 1 and grade <= 10)),
  add constraint inventory_costs_non_negative check (
    coalesce(purchase_cents, 0) >= 0 and fees_cents >= 0 and shipping_cents >= 0 and grading_cents >= 0
  );
alter table public.sales
  add constraint sales_amounts_non_negative check (price_cents >= 0 and platform_fees_cents >= 0 and shipping_cost_cents >= 0);
alter table public.expenses add constraint expenses_amount_positive check (amount_cents > 0);
alter table public.partners add constraint partners_split_range check (split_bps between 0 and 10000);
