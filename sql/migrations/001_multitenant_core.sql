-- =====================================================
-- Astrabody Platform — Migration 001: Multi-tenant core
-- =====================================================
-- Purpose: foundation schema for the multi-tenant SaaS booking platform.
-- Tenant 1 = Astrabody. All future tenants (salons, restaurants, clinics)
-- plug into the same tables with strict RLS isolation by tenant_id.
--
-- Conventions:
--   * Every tenant-scoped table has a tenant_id uuid NOT NULL FK to tenants(id).
--   * Every tenant-scoped table has RLS enabled with a policy that checks
--     tenant_id against the current user's allowed tenants.
--   * Indexes are always (tenant_id, <other key>) to keep RLS-filtered
--     queries fast.
--   * Timestamps use timestamptz, default now().
--   * Money is stored in pence (integer) to avoid float drift.
-- =====================================================

-- Make sure we have UUIDs and citext for case-insensitive emails
create extension if not exists "uuid-ossp";
create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- =====================================================
-- TENANTS — one row per business using the platform
-- =====================================================
create table if not exists public.tenants (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,           -- e.g. "astrabody", "le-petit-bistrot"
  name            text not null,                  -- "Astrabody", "Le Petit Bistrot"
  industry        text,                            -- "wellness", "restaurant", "salon"
  timezone        text not null default 'Europe/London',
  currency        text not null default 'GBP',
  -- white-label branding
  brand_primary   text default '#758564',          -- sage default (Astrabody)
  brand_secondary text default '#F6F3EE',          -- cream default
  logo_url        text,
  custom_domain   text unique,                     -- e.g. "book.astrabody.co.uk"
  -- subscription
  plan            text not null default 'starter', -- 'starter' | 'pro' | 'voice'
  plan_status     text not null default 'trialing',-- 'trialing' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at   timestamptz,
  stripe_customer_id text unique,
  -- meta
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tenants_slug on public.tenants(slug);
create index if not exists idx_tenants_custom_domain on public.tenants(custom_domain);

-- =====================================================
-- TENANT MEMBERS — who can log into which tenant
-- =====================================================
-- Links a Supabase auth user to a tenant with a role.
-- Used by RLS to decide if a user can read/write tenant rows.
create table if not exists public.tenant_members (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','staff','viewer')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_tenant_members_user on public.tenant_members(user_id);
create index if not exists idx_tenant_members_tenant on public.tenant_members(tenant_id);

-- Helper: returns the set of tenant_ids the current auth user belongs to.
-- Used inside every RLS policy below.
create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid();
$$;

-- =====================================================
-- STAFF — practitioners / employees inside a tenant
-- =====================================================
create table if not exists public.staff (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null, -- if they log in
  display_name  text not null,                    -- "Nigel", "Tove", "Jade"
  email         citext,
  phone         text,
  avatar_url    text,
  bio           text,
  is_active     boolean not null default true,
  -- ordering on the public booking page
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_staff_tenant on public.staff(tenant_id, is_active);

-- =====================================================
-- SERVICES — what a tenant sells (treatments / dishes / etc.)
-- =====================================================
create table if not exists public.services (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  slug            text not null,                  -- "infrabike-trial", "fat-freezing-3-zones"
  name            text not null,                  -- "InfraBike Trial"
  description     text,
  duration_min    int not null,                    -- 30, 45, 60
  buffer_min      int not null default 0,          -- cleanup time after
  price_pence     int not null default 0,          -- 3900 = £39.00
  deposit_pence   int not null default 0,          -- pre-payment to confirm
  category        text,                            -- "trial", "package", "session"
  is_bookable     boolean not null default true,
  -- minimum gap between two sessions of the same service for the same client
  min_gap_days    int not null default 0,          -- e.g. 56 for fat freezing, 28 for laser
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_services_tenant on public.services(tenant_id, is_bookable);

-- =====================================================
-- STAFF_SERVICES — which staff can perform which service
-- =====================================================
create table if not exists public.staff_services (
  staff_id    uuid not null references public.staff(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  primary key (staff_id, service_id)
);

create index if not exists idx_staff_services_tenant on public.staff_services(tenant_id);

-- =====================================================
-- WORKING_HOURS — recurring weekly availability per staff
-- =====================================================
create table if not exists public.working_hours (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  weekday     int not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  check (start_time < end_time)
);

create index if not exists idx_working_hours_staff on public.working_hours(tenant_id, staff_id, weekday);

-- =====================================================
-- TIME_OFF — one-off blocks (holidays, lunch, sick days)
-- =====================================================
-- We also pull these from Google Calendar via 2-way sync (see
-- google_calendar_integrations below). This table holds platform-native
-- time-off when GCal isn't connected, or for explicit overrides.
create table if not exists public.time_off (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  source      text not null default 'platform',  -- 'platform' | 'gcal'
  external_id text,                                -- gcal event id if source = 'gcal'
  created_at  timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index if not exists idx_time_off_staff_window on public.time_off(tenant_id, staff_id, starts_at, ends_at);

-- =====================================================
-- CLIENTS — end customers of a tenant
-- =====================================================
create table if not exists public.clients (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  full_name     text,
  email         citext,
  phone         text,
  birth_date    date,                             -- for birthday automation
  -- soft attributes
  source        text,                              -- 'meta_ads' | 'groupon' | 'walk_in' | 'referral'
  notes         text,
  marketing_opt_in boolean not null default false,
  -- denormalised stats (kept fresh by triggers later)
  bookings_count int not null default 0,
  last_booking_at timestamptz,
  total_spend_pence int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, email)
);

create index if not exists idx_clients_tenant_phone on public.clients(tenant_id, phone);
create index if not exists idx_clients_tenant_email on public.clients(tenant_id, email);
create index if not exists idx_clients_birthday on public.clients(tenant_id, birth_date);

-- =====================================================
-- BOOKINGS — the heart of the platform
-- =====================================================
create table if not exists public.bookings (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete restrict,
  staff_id        uuid not null references public.staff(id) on delete restrict,
  service_id      uuid not null references public.services(id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','cancelled','completed','no_show')),
  -- Google Calendar sync
  gcal_event_id   text,                            -- the event we wrote on staff's GCal
  gcal_calendar_id text,                           -- which calendar we wrote it to
  -- payment
  price_pence       int not null default 0,
  deposit_pence     int not null default 0,
  deposit_paid      boolean not null default false,
  stripe_payment_intent text,
  -- voucher / source
  voucher_code      text,                          -- groupon redemption etc.
  source            text,                          -- 'whatsapp_bot' | 'web' | 'staff' | 'walk_in'
  -- ops
  notes             text,
  reminder_24h_sent boolean not null default false,
  reminder_2h_sent  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancellation_reason text,
  check (starts_at < ends_at)
);

create index if not exists idx_bookings_tenant_window on public.bookings(tenant_id, starts_at, ends_at);
create index if not exists idx_bookings_staff_window on public.bookings(tenant_id, staff_id, starts_at);
create index if not exists idx_bookings_client on public.bookings(tenant_id, client_id, starts_at desc);
create index if not exists idx_bookings_status on public.bookings(tenant_id, status, starts_at);

-- =====================================================
-- GOOGLE_CALENDAR_INTEGRATIONS — per-staff OAuth tokens
-- =====================================================
-- Each staff member connects their own Google Calendar. We store the
-- refresh token (encrypted at the application layer before insert) and
-- the calendar_id we sync events into.
create table if not exists public.google_calendar_integrations (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  staff_id          uuid not null references public.staff(id) on delete cascade,
  google_email      citext not null,
  calendar_id       text not null,                  -- usually 'primary'
  refresh_token_enc text not null,                  -- application-encrypted refresh token
  access_token      text,                            -- short-lived, kept for warm cache
  access_token_expires_at timestamptz,
  scopes            text[] not null default array['https://www.googleapis.com/auth/calendar'],
  sync_state        text,                            -- gcal incremental sync token
  last_sync_at      timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (staff_id)                                 -- one GCal per staff for now
);

create index if not exists idx_gcal_tenant on public.google_calendar_integrations(tenant_id, is_active);

-- =====================================================
-- DEPOSITS — pre-payments tied to bookings
-- =====================================================
-- Optional table; we already store deposit fields on bookings. This is
-- for the audit trail (refunds, partial captures, Stripe events).
create table if not exists public.deposits (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  amount_pence    int not null,
  currency        text not null default 'GBP',
  status          text not null default 'requires_payment'
                  check (status in ('requires_payment','paid','refunded','failed')),
  stripe_payment_intent text unique,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_deposits_booking on public.deposits(tenant_id, booking_id);

-- =====================================================
-- REVIEW_REQUESTS — the Google Reviews Booster engine
-- =====================================================
-- After a booking is marked completed, we generate one review_request.
-- We send the NPS prompt (1-10), record the score, and (if 8+) track
-- whether the client clicked the Google review deep-link.
create table if not exists public.review_requests (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  booking_id        uuid not null references public.bookings(id) on delete cascade unique,
  client_id         uuid not null references public.clients(id) on delete cascade,
  channel           text not null default 'whatsapp',  -- 'whatsapp' | 'sms' | 'email'
  sent_at           timestamptz,
  nps_score         int check (nps_score between 0 and 10),
  nps_answered_at   timestamptz,
  -- if score >= 8 we send the public review link
  google_link_sent_at timestamptz,
  google_link_clicked_at timestamptz,
  -- if score <= 7 we route privately to staff
  private_feedback  text,
  -- reward redemption (e.g. "£10 off next session")
  reward_code       text,
  reward_redeemed_at timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_review_requests_tenant on public.review_requests(tenant_id, created_at desc);
create index if not exists idx_review_requests_score on public.review_requests(tenant_id, nps_score);

-- =====================================================
-- MEMBERSHIPS — recurring revenue products
-- =====================================================
-- A tenant defines membership tiers (e.g. "InfraBike Unlimited £79/mo").
-- Clients subscribe via Stripe. Each billing cycle they get a credit
-- balance they can redeem against bookings.
create table if not exists public.memberships (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  slug                text not null,
  name                text not null,
  description         text,
  price_pence         int not null,
  interval            text not null default 'month' check (interval in ('week','month','year')),
  -- what the membership grants
  credits_per_cycle   int not null default 0,           -- e.g. 8 sessions/month
  service_ids         uuid[],                            -- restrict to these services (null = all)
  stripe_price_id     text,
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_memberships_tenant on public.memberships(tenant_id, is_active);

create table if not exists public.membership_subscriptions (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  membership_id         uuid not null references public.memberships(id) on delete restrict,
  client_id             uuid not null references public.clients(id) on delete cascade,
  stripe_subscription_id text unique,
  status                text not null default 'active'
                        check (status in ('active','past_due','cancelled','paused')),
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  credits_remaining     int not null default 0,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_msub_tenant_client on public.membership_subscriptions(tenant_id, client_id, status);

-- =====================================================
-- WIN_BACK_CAMPAIGNS — automated lapsed-client outreach
-- =====================================================
-- Tracks who we've sent win-back messages to so we don't spam them.
create table if not exists public.win_back_events (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  channel       text not null,                       -- 'whatsapp' | 'email' | 'voice'
  template      text not null,                       -- which template fired
  sent_at       timestamptz not null default now(),
  responded     boolean not null default false,
  booked        boolean not null default false       -- did it lead to a booking?
);

create index if not exists idx_winback_tenant_client on public.win_back_events(tenant_id, client_id, sent_at desc);

-- =====================================================
-- ROW LEVEL SECURITY — tenant isolation
-- =====================================================
-- Pattern: enable RLS, then add a single permissive policy that allows
-- a row only if its tenant_id is in the current user's tenant set.
-- The service_role bypasses RLS automatically (Supabase default), which
-- is what the bot and edge functions use. Dashboard users use the anon
-- key + JWT so RLS applies.

alter table public.tenants                    enable row level security;
alter table public.tenant_members             enable row level security;
alter table public.staff                      enable row level security;
alter table public.services                   enable row level security;
alter table public.staff_services             enable row level security;
alter table public.working_hours              enable row level security;
alter table public.time_off                   enable row level security;
alter table public.clients                    enable row level security;
alter table public.bookings                   enable row level security;
alter table public.google_calendar_integrations enable row level security;
alter table public.deposits                   enable row level security;
alter table public.review_requests            enable row level security;
alter table public.memberships                enable row level security;
alter table public.membership_subscriptions   enable row level security;
alter table public.win_back_events            enable row level security;

-- Tenants table: a member can read their own tenant; only owners can update.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id in (select public.current_user_tenant_ids()));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update using (
    id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Tenant members: read your own tenant's members; manage requires owner/admin.
drop policy if exists members_select on public.tenant_members;
create policy members_select on public.tenant_members
  for select using (tenant_id in (select public.current_user_tenant_ids()));

drop policy if exists members_write on public.tenant_members;
create policy members_write on public.tenant_members
  for all using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Generic per-table policy generator (one all-action policy per table).
do $$
declare
  t text;
  tables text[] := array[
    'staff','services','staff_services','working_hours','time_off',
    'clients','bookings','google_calendar_integrations','deposits',
    'review_requests','memberships','membership_subscriptions','win_back_events'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_tenant_isolation on public.%I;', t, t);
    execute format(
      'create policy %I_tenant_isolation on public.%I for all '
      || 'using (tenant_id in (select public.current_user_tenant_ids())) '
      || 'with check (tenant_id in (select public.current_user_tenant_ids()));',
      t, t
    );
  end loop;
end $$;

-- =====================================================
-- TRIGGERS — keep updated_at fresh
-- =====================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
  tables text[] := array[
    'tenants','staff','services','clients','bookings',
    'google_calendar_integrations','membership_subscriptions'
  ];
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
-- SEED — Tenant 1 = Astrabody
-- =====================================================
insert into public.tenants (slug, name, industry, timezone, currency,
                            brand_primary, brand_secondary, plan, plan_status,
                            custom_domain)
values ('astrabody','Astrabody','wellness','Europe/London','GBP',
        '#758564','#F6F3EE','pro','active',
        'book.astrabody.co.uk')
on conflict (slug) do nothing;

-- =====================================================
-- DONE.
-- Next migration (002) will add: notification_templates, audit_log,
-- gift_cards, referrals, loyalty_points.
-- =====================================================
