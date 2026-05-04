-- =====================================================
-- Astrabody Platform — Migration 017
-- Unified admin notifications
-- =====================================================
-- Single inbox for everything that needs admin attention:
-- monthly payroll, no-show charges, reviews, coach refresh, etc.
-- The bell + dropdown + per-nav-item badges all read from here.
-- =====================================================

create table if not exists public.notifications (
  id                 uuid primary key default uuid_generate_v4(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  recipient_user_id  uuid not null references auth.users(id) on delete cascade,
  kind               text not null check (kind in (
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
                       'card_declined'
                     )),
  title              text not null,
  body               text,
  action_url         text,
  payload            jsonb default '{}'::jsonb,
  priority           text not null default 'normal'
                     check (priority in ('low','normal','high','urgent')),
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_recipient_recent_idx
  on public.notifications(recipient_user_id, created_at desc);

create index if not exists notifications_kind_payload_idx
  on public.notifications(recipient_user_id, kind, created_at desc);

alter table public.notifications enable row level security;

-- A user can SELECT only her own notifications.
drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select using (recipient_user_id = auth.uid());

-- A user can mark her own notifications as read (UPDATE read_at).
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- INSERT is service-role only — the helper at src/lib/notifications/insert.ts
-- runs with the admin client and bypasses RLS.

-- =====================================================
-- DONE.
-- =====================================================
