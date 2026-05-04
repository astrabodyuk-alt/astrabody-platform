-- =====================================================
-- Astrabody Platform — Migration 019
-- Staff time-off, studio closures, AI settings assistant
-- =====================================================
-- Adds two domain tables (staff_time_off, tenant_closures) used by the
-- availability resolver to mark dates fully or partially unavailable
-- without any client configuration. Adds settings_ai_log to capture the
-- audit trail of the AI assistant in /admin/settings. Extends the
-- notifications.kind check to cover two new admin signals.
-- =====================================================

-- -----------------------------------------------------
-- STAFF_TIME_OFF — discrete date-range blocks per staff
-- -----------------------------------------------------
create table if not exists public.staff_time_off (
  id                 uuid primary key default uuid_generate_v4(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  staff_id           uuid not null references public.staff(id) on delete cascade,
  starts_on          date not null,
  ends_on            date not null,
  reason             text,
  is_all_day         boolean not null default true,
  partial_start      time,
  partial_end        time,
  created_by_user_id uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (
    (is_all_day = true  and partial_start is null     and partial_end is null)
    or
    (is_all_day = false and partial_start is not null and partial_end is not null
                        and partial_start < partial_end)
  )
);

create index if not exists staff_time_off_lookup_idx
  on public.staff_time_off(tenant_id, staff_id, starts_on, ends_on);

alter table public.staff_time_off enable row level security;

drop policy if exists staff_time_off_select on public.staff_time_off;
create policy staff_time_off_select on public.staff_time_off
  for select using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists staff_time_off_write on public.staff_time_off;
create policy staff_time_off_write on public.staff_time_off
  for all using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- -----------------------------------------------------
-- TENANT_CLOSURES — studio-wide or per-service blocks
-- -----------------------------------------------------
create table if not exists public.tenant_closures (
  id                 uuid primary key default uuid_generate_v4(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  starts_on          date not null,
  ends_on            date not null,
  reason             text,
  is_all_day         boolean not null default true,
  partial_start      time,
  partial_end        time,
  service_id         uuid references public.services(id) on delete cascade,
  created_by_user_id uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (
    (is_all_day = true  and partial_start is null     and partial_end is null)
    or
    (is_all_day = false and partial_start is not null and partial_end is not null
                        and partial_start < partial_end)
  )
);

create index if not exists tenant_closures_lookup_idx
  on public.tenant_closures(tenant_id, starts_on, ends_on);

create index if not exists tenant_closures_service_idx
  on public.tenant_closures(tenant_id, service_id, starts_on, ends_on)
  where service_id is not null;

-- Unique guard against duplicate seeds. Two closures with the same
-- date + reason + scope are rejected.
create unique index if not exists tenant_closures_dedupe_idx
  on public.tenant_closures(
    tenant_id,
    starts_on,
    ends_on,
    coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(coalesce(reason, ''))
  );

alter table public.tenant_closures enable row level security;

drop policy if exists tenant_closures_select on public.tenant_closures;
create policy tenant_closures_select on public.tenant_closures
  for select using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists tenant_closures_write on public.tenant_closures;
create policy tenant_closures_write on public.tenant_closures
  for all using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- -----------------------------------------------------
-- SETTINGS_AI_LOG — audit trail for the AI assistant
-- -----------------------------------------------------
create table if not exists public.settings_ai_log (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  user_message    text not null,
  assistant_plan  jsonb,
  was_confirmed   boolean,
  applied_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists settings_ai_log_tenant_recent_idx
  on public.settings_ai_log(tenant_id, created_at desc);

alter table public.settings_ai_log enable row level security;

drop policy if exists settings_ai_log_select on public.settings_ai_log;
create policy settings_ai_log_select on public.settings_ai_log
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

drop policy if exists settings_ai_log_insert on public.settings_ai_log;
create policy settings_ai_log_insert on public.settings_ai_log
  for insert with check (
    user_id = auth.uid()
    and tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

drop policy if exists settings_ai_log_update on public.settings_ai_log;
create policy settings_ai_log_update on public.settings_ai_log
  for update using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- -----------------------------------------------------
-- Extend notifications.kind to cover the new signals.
-- -----------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'monthly_payroll_ready',
    'noshow_charged',
    'noshow_charge_failed',
    'late_cancel_charged',
    'review_received',
    'google_review_posted',
    'coach_refreshed',
    'new_chat_message',
    'birthday_today',
    'pack_expiring_soon',
    'booking_confirmed',
    'booking_cancelled',
    'card_declined',
    'staff_time_off_added',
    'studio_closure_added'
  ));

-- -----------------------------------------------------
-- SEED — UK Bank Holidays 2026 for the Astrabody tenant.
-- Dedupe index above guarantees idempotency.
-- -----------------------------------------------------
do $$
declare
  astra_id uuid;
  hol record;
begin
  select id into astra_id from public.tenants where slug = 'astrabody' limit 1;
  if astra_id is null then
    return;
  end if;

  for hol in
    select * from (values
      ('2026-01-01'::date, 'New Year''s Day'),
      ('2026-04-03'::date, 'Good Friday'),
      ('2026-04-06'::date, 'Easter Monday'),
      ('2026-05-04'::date, 'Early May bank holiday'),
      ('2026-05-25'::date, 'Spring bank holiday'),
      ('2026-08-31'::date, 'Summer bank holiday'),
      ('2026-12-25'::date, 'Christmas Day'),
      ('2026-12-26'::date, 'Boxing Day')
    ) as t(d, label)
  loop
    insert into public.tenant_closures
      (tenant_id, starts_on, ends_on, reason, is_all_day)
    values
      (astra_id, hol.d, hol.d, hol.label, true)
    on conflict do nothing;
  end loop;
end
$$;

-- =====================================================
-- DONE.
-- =====================================================
