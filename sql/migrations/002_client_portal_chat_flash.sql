-- =====================================================
-- Astrabody Platform — Migration 002
-- Client portal + in-app chat + flash slot feed
-- =====================================================
-- New requirements (added 2026-04-27):
--   1. Admin dashboard (already covered: tenant_members + RLS).
--   2. Client portal — clients log in and see their sessions, progress,
--      personal notes.
--   3. In-app chat — clients message the studio, staff replies (parallel
--      to the WhatsApp bot).
--   4. Flash slot feed — same-day cancellations / open spots are surfaced
--      to clients on a public/private feed they can grab.
-- =====================================================

-- =====================================================
-- 1. CLIENT PORTAL ACCESS
-- =====================================================
-- A client logs in with their email (Supabase Auth magic link / OTP).
-- Once authenticated, the auth.users row is linked to the clients row
-- via this table. RLS on clients/bookings/etc. is then opened to "self"
-- using a helper function below.

create table if not exists public.client_portal_links (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id)   -- a client logs into one tenant context at a time
);

create index if not exists idx_client_portal_user on public.client_portal_links(user_id);
create index if not exists idx_client_portal_client on public.client_portal_links(client_id);

-- Helper: returns the client_ids the current auth user is allowed to see
-- AS A CLIENT (i.e. their own record, not as a staff member).
create or replace function public.current_user_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id
  from public.client_portal_links
  where user_id = auth.uid();
$$;

-- =====================================================
-- 2. SESSION LOGS — what happened in each session
-- =====================================================
-- One row per completed booking, written by the staff member after the
-- session. Holds private staff notes + numbers shown to the client
-- (weight, measurements, progress photos URL, etc.).
create table if not exists public.session_logs (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  booking_id      uuid not null references public.bookings(id) on delete cascade unique,
  client_id       uuid not null references public.clients(id) on delete cascade,
  staff_id        uuid not null references public.staff(id) on delete set null,
  -- visible to client
  summary_public  text,
  metrics         jsonb,                            -- {"weight_kg": 68.2, "waist_cm": 78, "fat_pct": 23.1}
  photo_urls      text[],                           -- before/after photos (storage URLs)
  -- staff-only
  notes_internal  text,
  -- shown on the client's progress chart
  is_shared_with_client boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_session_logs_client on public.session_logs(tenant_id, client_id, created_at desc);

-- =====================================================
-- 3. CLIENT NOTES — what the client themselves writes
-- =====================================================
-- The client adds personal notes from their portal: how they felt,
-- side effects, goals, milestones. Visible to staff for context.
create table if not exists public.client_notes (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  booking_id    uuid references public.bookings(id) on delete set null,  -- optional link
  body          text not null,
  mood_score    int check (mood_score between 1 and 5),
  is_visible_to_staff boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_client_notes_client on public.client_notes(tenant_id, client_id, created_at desc);

-- =====================================================
-- 4. IN-APP CHAT — client <-> studio
-- =====================================================
-- One thread per (tenant, client). Messages flow both ways.
-- The same `chat_messages` table can also surface the WhatsApp-bot
-- conversations if you set channel = 'whatsapp', so staff has one inbox.

create table if not exists public.chat_threads (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  channel         text not null default 'in_app',     -- 'in_app' | 'whatsapp' | 'sms'
  -- inbox sorting
  last_message_at timestamptz,
  last_message_preview text,
  unread_count_staff  int not null default 0,
  unread_count_client int not null default 0,
  -- assignment
  assigned_to_staff_id uuid references public.staff(id) on delete set null,
  status          text not null default 'open' check (status in ('open','snoozed','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, client_id, channel)
);

create index if not exists idx_chat_threads_inbox on public.chat_threads(tenant_id, status, last_message_at desc);

create table if not exists public.chat_messages (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  thread_id     uuid not null references public.chat_threads(id) on delete cascade,
  -- exactly one of sender_client_id / sender_staff_id is set
  sender_client_id  uuid references public.clients(id) on delete set null,
  sender_staff_id   uuid references public.staff(id) on delete set null,
  -- bot-authored messages have neither, with author_type = 'bot'
  author_type   text not null check (author_type in ('client','staff','bot','system')),
  body          text,
  attachments   jsonb,                             -- [{"url":"...","kind":"image|file|audio"}]
  -- delivery receipts
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread on public.chat_messages(thread_id, created_at);
create index if not exists idx_chat_messages_tenant on public.chat_messages(tenant_id, created_at desc);

-- Trigger: keep chat_threads' last_message_* fresh when a message lands.
create or replace function public.touch_chat_thread()
returns trigger language plpgsql as $$
begin
  update public.chat_threads
  set last_message_at = new.created_at,
      last_message_preview = left(coalesce(new.body, ''), 140),
      unread_count_staff  = case when new.author_type = 'client' then unread_count_staff + 1 else unread_count_staff end,
      unread_count_client = case when new.author_type in ('staff','bot') then unread_count_client + 1 else unread_count_client end,
      updated_at = now()
  where id = new.thread_id;
  return new;
end $$;

drop trigger if exists trg_chat_messages_touch on public.chat_messages;
create trigger trg_chat_messages_touch
after insert on public.chat_messages
for each row execute function public.touch_chat_thread();

-- =====================================================
-- 5. FLASH SLOTS — last-minute openings feed
-- =====================================================
-- Two ways to populate this:
--   a) Auto: when a booking gets cancelled within X hours, we create
--      a flash_slot row with an optional discount.
--   b) Manual: staff opens a slot from the dashboard ("I have 4pm free,
--      drop -20% to fill it").
-- Clients see the feed on their portal and on a public page.

create table if not exists public.flash_slots (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  staff_id          uuid not null references public.staff(id) on delete cascade,
  service_id        uuid references public.services(id) on delete set null, -- null = "any compatible service"
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- pricing
  list_price_pence  int not null,                    -- the normal price
  flash_price_pence int not null,                    -- the discounted price for this slot
  -- visibility
  visibility        text not null default 'public'   -- 'public' | 'members_only' | 'invited'
                    check (visibility in ('public','members_only','invited')),
  invited_client_ids uuid[],                          -- if visibility = 'invited'
  -- claiming
  claimed_by_client_id uuid references public.clients(id) on delete set null,
  claimed_booking_id  uuid references public.bookings(id) on delete set null,
  claimed_at        timestamptz,
  expires_at        timestamptz,                       -- auto-disappear from feed
  source            text not null default 'manual'    -- 'manual' | 'auto_cancellation'
                    check (source in ('manual','auto_cancellation')),
  created_at        timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index if not exists idx_flash_slots_feed on public.flash_slots(tenant_id, starts_at)
  where claimed_at is null;
create index if not exists idx_flash_slots_staff on public.flash_slots(tenant_id, staff_id, starts_at);

-- =====================================================
-- 6. RLS — open relevant tables to clients (self-service)
-- =====================================================
-- Pattern: keep the existing "tenant_isolation" policy (for staff) AND
-- add a "self" policy that lets a client see / write their own rows
-- when logged in to the portal.

alter table public.client_portal_links enable row level security;
alter table public.session_logs        enable row level security;
alter table public.client_notes        enable row level security;
alter table public.chat_threads        enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.flash_slots         enable row level security;

-- client_portal_links: a user can read their own link; staff with
-- tenant access can read their tenant's links.
drop policy if exists cpl_self on public.client_portal_links;
create policy cpl_self on public.client_portal_links
  for select using (
    user_id = auth.uid()
    or tenant_id in (select public.current_user_tenant_ids())
  );

drop policy if exists cpl_staff_write on public.client_portal_links;
create policy cpl_staff_write on public.client_portal_links
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- session_logs: staff via tenant; client via self (only if shared).
drop policy if exists session_logs_staff on public.session_logs;
create policy session_logs_staff on public.session_logs
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists session_logs_client_self on public.session_logs;
create policy session_logs_client_self on public.session_logs
  for select using (
    is_shared_with_client = true
    and client_id in (select public.current_user_client_ids())
  );

-- client_notes: client owns their own; staff can read those flagged visible.
drop policy if exists client_notes_owner on public.client_notes;
create policy client_notes_owner on public.client_notes
  for all using (client_id in (select public.current_user_client_ids()))
  with check (client_id in (select public.current_user_client_ids()));

drop policy if exists client_notes_staff_read on public.client_notes;
create policy client_notes_staff_read on public.client_notes
  for select using (
    is_visible_to_staff = true
    and tenant_id in (select public.current_user_tenant_ids())
  );

-- chat_threads + chat_messages: client sees their own threads; staff sees all in tenant.
drop policy if exists chat_threads_client on public.chat_threads;
create policy chat_threads_client on public.chat_threads
  for all using (client_id in (select public.current_user_client_ids()))
  with check (client_id in (select public.current_user_client_ids()));

drop policy if exists chat_threads_staff on public.chat_threads;
create policy chat_threads_staff on public.chat_threads
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists chat_messages_client on public.chat_messages;
create policy chat_messages_client on public.chat_messages
  for all using (
    thread_id in (
      select id from public.chat_threads
      where client_id in (select public.current_user_client_ids())
    )
  ) with check (
    -- a client can only insert messages where they are the sender
    (author_type = 'client'
     and sender_client_id in (select public.current_user_client_ids()))
  );

drop policy if exists chat_messages_staff on public.chat_messages;
create policy chat_messages_staff on public.chat_messages
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- flash_slots: clients can read public/invited; staff full access in tenant.
drop policy if exists flash_slots_public on public.flash_slots;
create policy flash_slots_public on public.flash_slots
  for select using (
    visibility = 'public'
    or (visibility = 'invited'
        and exists (
          select 1 from public.client_portal_links cpl
          where cpl.user_id = auth.uid()
            and cpl.client_id = any(invited_client_ids)
        ))
  );

drop policy if exists flash_slots_staff on public.flash_slots;
create policy flash_slots_staff on public.flash_slots
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- =====================================================
-- 7. Open existing tables (bookings, clients) to client-self read
-- =====================================================
-- These already have a tenant_isolation policy for staff. We add a
-- self policy so a logged-in client can see their own bookings/profile
-- without needing staff role.

drop policy if exists bookings_client_self on public.bookings;
create policy bookings_client_self on public.bookings
  for select using (client_id in (select public.current_user_client_ids()));

drop policy if exists clients_self on public.clients;
create policy clients_self on public.clients
  for all using (id in (select public.current_user_client_ids()))
  with check (id in (select public.current_user_client_ids()));

-- =====================================================
-- 8. Touch triggers for new tables
-- =====================================================
do $$
declare
  t text;
  tables text[] := array['session_logs','client_notes','chat_threads'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%I_touch on public.%I;', t, t);
    execute format(
      'create trigger trg_%I_touch before update on public.%I '
      || 'for each row execute function public.touch_updated_at();',
      t, t
    );
  end loop;
end $$;

-- =====================================================
-- DONE.
-- After 002, the platform supports:
--   - Admin dashboard (RLS by tenant_member role)
--   - Client portal (self-service via client_portal_links)
--   - Session progress with metrics + photos
--   - Client-authored notes
--   - In-app chat parallel to WhatsApp
--   - Flash slot feed for last-minute openings
-- =====================================================
