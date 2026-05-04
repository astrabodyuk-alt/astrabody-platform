-- =====================================================
-- Astrabody Platform — Migration 020
-- Bank holiday planner + universal client comms proposals
-- =====================================================
-- Owner gets a per-tenant ledger of upcoming UK bank holidays with a
-- pending → closed | open decision and built-in 2-month reminders.
-- The comms_proposals table powers the universal "Notify clients?" bar
-- that surfaces after every action with client impact.
-- =====================================================

-- -----------------------------------------------------
-- BANK_HOLIDAY_DECISIONS — one row per tenant per UK BH
-- -----------------------------------------------------
create table if not exists public.bank_holiday_decisions (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  date                  date not null,
  name                  text not null,
  year                  int not null generated always as (extract(year from date)::int) stored,
  decision              text not null default 'pending'
                          check (decision in ('pending','closed','open')),
  decided_at            timestamptz,
  decided_by_user_id    uuid references auth.users(id),
  reminder_sent_at      timestamptz,
  urgent_reminder_sent_at timestamptz,
  client_email_sent_at  timestamptz,
  created_at            timestamptz not null default now(),
  unique (tenant_id, date)
);

create index if not exists bank_holiday_decisions_tenant_year_idx
  on public.bank_holiday_decisions(tenant_id, year, date);

create index if not exists bank_holiday_decisions_pending_idx
  on public.bank_holiday_decisions(tenant_id, date)
  where decision = 'pending';

alter table public.bank_holiday_decisions enable row level security;

drop policy if exists bank_holiday_decisions_select on public.bank_holiday_decisions;
create policy bank_holiday_decisions_select on public.bank_holiday_decisions
  for select using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists bank_holiday_decisions_write on public.bank_holiday_decisions;
create policy bank_holiday_decisions_write on public.bank_holiday_decisions
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
-- COMMS_PROPOSALS — universal "Notify clients?" queue
-- -----------------------------------------------------
create table if not exists public.comms_proposals (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  trigger_kind          text not null check (trigger_kind in (
                          'studio_closure',
                          'bank_holiday_closure',
                          'working_hours_change',
                          'service_price_change',
                          'new_service',
                          'flash_slot',
                          'new_package',
                          'loyalty_promotion',
                          'studio_reopening'
                        )),
  trigger_ref_id        uuid,
  trigger_summary       text not null,
  draft_subject         text,
  draft_body_md         text,
  default_segment       jsonb default '{"type":"all"}'::jsonb,
  status                text not null default 'pending'
                          check (status in ('pending','sent','dismissed')),
  broadcast_id          uuid references public.email_broadcasts(id) on delete set null,
  sent_at               timestamptz,
  sent_count            int,
  dismissed_at          timestamptz,
  dismissed_by_user_id  uuid references auth.users(id),
  created_by_user_id    uuid references auth.users(id),
  created_at            timestamptz not null default now()
);

create index if not exists comms_proposals_tenant_pending_idx
  on public.comms_proposals(tenant_id, created_at desc)
  where status = 'pending';

create index if not exists comms_proposals_recent_idx
  on public.comms_proposals(tenant_id, created_at desc);

alter table public.comms_proposals enable row level security;

drop policy if exists comms_proposals_select on public.comms_proposals;
create policy comms_proposals_select on public.comms_proposals
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

drop policy if exists comms_proposals_update on public.comms_proposals;
create policy comms_proposals_update on public.comms_proposals
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

-- INSERT is service-role only — proposals are created via server actions
-- that already gate on owner/admin and run with the admin client.

-- -----------------------------------------------------
-- Extend notifications.kind to cover the bank holiday reminder.
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
    'studio_closure_added',
    'bank_holiday_reminder'
  ));

-- =====================================================
-- DONE.
-- =====================================================
