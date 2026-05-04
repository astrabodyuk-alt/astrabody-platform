-- =====================================================
-- Astrabody Platform — Migration 003
-- Web Push subscriptions + Inner Circle loyalty system
-- =====================================================
-- Adds two feature areas:
--   A. Web Push (PWA) subscriptions, so the platform can notify the
--      client's installed app when a chat message lands. Falls back to
--      WhatsApp if no push subscription is alive.
--   B. The "Inner Circle" loyalty programme — points, tiers, rewards
--      catalogue, redemptions, referrals. Designed using Cialdini /
--      Schwartz / Kahneman / Ariely frameworks (see
--      Astrabody_Loyalty_Strategy.md).
-- =====================================================

-- =====================================================
-- A. WEB PUSH SUBSCRIPTIONS
-- =====================================================
create table if not exists public.client_push_subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  endpoint        text not null,                    -- the Web Push endpoint URL
  p256dh_key      text not null,                    -- public key for encryption
  auth_key        text not null,                    -- auth secret for encryption
  user_agent      text,                             -- 'iPhone Safari', 'Chrome Android' etc.
  device_label    text,                             -- a friendly name the client picks
  is_active       boolean not null default true,
  last_seen_at    timestamptz,
  failure_count   int not null default 0,           -- bumped when delivery fails; deactivate after N
  created_at      timestamptz not null default now(),
  unique (client_id, endpoint)
);

create index if not exists idx_push_active on public.client_push_subscriptions(tenant_id, client_id, is_active);

alter table public.client_push_subscriptions enable row level security;

drop policy if exists push_self on public.client_push_subscriptions;
create policy push_self on public.client_push_subscriptions
  for all using (client_id in (select public.current_user_client_ids()))
  with check (client_id in (select public.current_user_client_ids()));

drop policy if exists push_staff on public.client_push_subscriptions;
create policy push_staff on public.client_push_subscriptions
  for select using (tenant_id in (select public.current_user_tenant_ids()));

-- Track which channel a chat message used + whether it fell back.
alter table public.chat_messages
  add column if not exists primary_channel text,           -- 'in_app_push' | 'whatsapp' | 'sms' | 'email'
  add column if not exists fallback_channel text,
  add column if not exists delivery_attempts jsonb;        -- audit log of delivery tries

-- =====================================================
-- B. INNER CIRCLE — LOYALTY ACCOUNTS
-- =====================================================
-- One account per (tenant, client). Holds the cached current balance
-- + lifetime totals so we don't sum the ledger on every page load.
-- The ledger is the source of truth; the account is a denormalised cache.
create table if not exists public.loyalty_accounts (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  current_points    int not null default 0,
  lifetime_points   int not null default 0,            -- never decreases (used for tier calc)
  tier              text not null default 'friend'
                    check (tier in ('friend','insider','inner_circle')),
  tier_reached_at   timestamptz,
  last_earn_at      timestamptz,
  last_redeem_at    timestamptz,
  -- streaks (one booking per month for N consecutive months)
  current_streak_months int not null default 0,
  longest_streak_months int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, client_id)
);

create index if not exists idx_loyalty_accounts_tier on public.loyalty_accounts(tenant_id, tier);

-- =====================================================
-- LOYALTY LEDGER — every credit / debit / expiry
-- =====================================================
-- Source of truth. Account row is just a cache.
create table if not exists public.loyalty_ledger (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  delta_points    int not null,                       -- positive = earn, negative = redeem/expire
  reason          text not null check (reason in (
                    'welcome_bonus',
                    'booking_completed',
                    'birthday_bonus',
                    'review_5_star',
                    'referral_friend_signup',
                    'referral_friend_first_booking',
                    'session_log_added',
                    'streak_bonus',
                    'manual_credit',
                    'redemption',
                    'expiry',
                    'manual_debit',
                    'gifted_to_friend'
                  )),
  -- optional cross-references
  booking_id      uuid references public.bookings(id) on delete set null,
  review_request_id uuid references public.review_requests(id) on delete set null,
  redemption_id   uuid,                                -- forward FK; resolved at app layer
  referral_id     uuid,
  -- expiry tracking
  expires_at      timestamptz,                         -- when this earn entry will expire (null for debits)
  expired_at      timestamptz,                         -- when an expiry has been processed
  -- description shown to the client
  display_label   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ledger_client on public.loyalty_ledger(tenant_id, client_id, created_at desc);
create index if not exists idx_ledger_expiry on public.loyalty_ledger(tenant_id, expires_at)
  where expired_at is null and delta_points > 0;

-- =====================================================
-- LOYALTY REWARDS — the catalogue a tenant offers
-- =====================================================
create table if not exists public.loyalty_rewards (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  slug            text not null,
  name            text not null,                      -- "Free InfraBike session"
  description     text,
  cost_points     int not null,
  kind            text not null check (kind in (
                    'discount_pence',                  -- absolute discount on next booking
                    'percent_off',                     -- percent discount on a service
                    'free_service',                    -- a complimentary session
                    'gift_friend_session',             -- bring a friend / send to friend
                    'gift_card',                       -- digital gift card any value
                    'experience'                       -- bespoke "Sculpt Day" etc.
                  )),
  -- payload depending on kind
  service_id      uuid references public.services(id) on delete set null,
  value_pence     int,                                  -- discount_pence / gift_card amount
  percent_value   int,                                  -- 5..50
  -- gating
  min_tier        text default 'friend' check (min_tier in ('friend','insider','inner_circle')),
  is_active       boolean not null default true,
  inventory       int,                                  -- nullable = unlimited, else cap per month
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_rewards_active on public.loyalty_rewards(tenant_id, is_active, cost_points);

-- =====================================================
-- LOYALTY REDEMPTIONS — when a client cashes points in
-- =====================================================
create table if not exists public.loyalty_redemptions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  reward_id       uuid not null references public.loyalty_rewards(id) on delete restrict,
  points_spent    int not null,
  status          text not null default 'pending'
                  check (status in ('pending','fulfilled','cancelled','refunded')),
  -- how it was applied
  booking_id      uuid references public.bookings(id) on delete set null, -- for free/discounted sessions
  voucher_code    text,                                 -- generated for discount_pence / percent_off
  gift_recipient_email citext,                          -- gift_card / gift_friend_session
  gift_recipient_name  text,
  gift_message    text,
  fulfilled_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_redemptions_client on public.loyalty_redemptions(tenant_id, client_id, created_at desc);
create index if not exists idx_redemptions_status on public.loyalty_redemptions(tenant_id, status);

-- =====================================================
-- LOYALTY REFERRALS — who invited whom
-- =====================================================
create table if not exists public.loyalty_referrals (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  referrer_client_id  uuid not null references public.clients(id) on delete cascade,
  referred_client_id  uuid references public.clients(id) on delete set null, -- null until they sign up
  invite_code         text not null,                    -- short code, shared via PWA "Invite a friend" button
  invite_channel      text,                             -- 'whatsapp' | 'email' | 'link'
  invited_email       citext,
  invited_phone       text,
  status              text not null default 'invited'
                      check (status in ('invited','signed_up','first_booking_completed','expired')),
  reward_credited_referrer boolean not null default false,
  reward_credited_referred boolean not null default false,
  signed_up_at        timestamptz,
  first_booking_at    timestamptz,
  expires_at          timestamptz,                       -- e.g. 90 days
  created_at          timestamptz not null default now(),
  unique (tenant_id, invite_code)
);

create index if not exists idx_referrals_referrer on public.loyalty_referrals(tenant_id, referrer_client_id, status);
create index if not exists idx_referrals_referred on public.loyalty_referrals(tenant_id, referred_client_id);

-- =====================================================
-- RLS — loyalty tables
-- =====================================================
alter table public.loyalty_accounts    enable row level security;
alter table public.loyalty_ledger      enable row level security;
alter table public.loyalty_rewards     enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_referrals   enable row level security;

-- account: client sees own; staff sees tenant.
drop policy if exists loyalty_accounts_self on public.loyalty_accounts;
create policy loyalty_accounts_self on public.loyalty_accounts
  for select using (client_id in (select public.current_user_client_ids()));

drop policy if exists loyalty_accounts_staff on public.loyalty_accounts;
create policy loyalty_accounts_staff on public.loyalty_accounts
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- ledger: client reads own; staff full tenant; service_role bypasses RLS for writes.
drop policy if exists ledger_self on public.loyalty_ledger;
create policy ledger_self on public.loyalty_ledger
  for select using (client_id in (select public.current_user_client_ids()));

drop policy if exists ledger_staff on public.loyalty_ledger;
create policy ledger_staff on public.loyalty_ledger
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- rewards catalogue: anyone with auth in tenant context can read; staff manage.
drop policy if exists rewards_read on public.loyalty_rewards;
create policy rewards_read on public.loyalty_rewards
  for select using (
    is_active = true
    and (
      tenant_id in (select public.current_user_tenant_ids())
      or exists (
        select 1 from public.client_portal_links cpl
        where cpl.user_id = auth.uid() and cpl.tenant_id = loyalty_rewards.tenant_id
      )
    )
  );

drop policy if exists rewards_staff on public.loyalty_rewards;
create policy rewards_staff on public.loyalty_rewards
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- redemptions: client manages own pending; staff full tenant.
drop policy if exists redemptions_self on public.loyalty_redemptions;
create policy redemptions_self on public.loyalty_redemptions
  for all using (client_id in (select public.current_user_client_ids()))
  with check (client_id in (select public.current_user_client_ids()));

drop policy if exists redemptions_staff on public.loyalty_redemptions;
create policy redemptions_staff on public.loyalty_redemptions
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- referrals: referrer can manage own; staff full tenant.
drop policy if exists referrals_referrer on public.loyalty_referrals;
create policy referrals_referrer on public.loyalty_referrals
  for all using (referrer_client_id in (select public.current_user_client_ids()))
  with check (referrer_client_id in (select public.current_user_client_ids()));

drop policy if exists referrals_staff on public.loyalty_referrals;
create policy referrals_staff on public.loyalty_referrals
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- =====================================================
-- TRIGGERS — keep loyalty_accounts cache fresh
-- =====================================================
-- After every ledger insert, update the matching account row.
create or replace function public.apply_ledger_to_account()
returns trigger language plpgsql as $$
declare
  _new_lifetime int;
  _new_current  int;
  _new_tier     text;
begin
  -- lifetime only counts positive, non-expiry entries
  -- (we keep "lifetime" as the historical earn total used for tier calc)
  insert into public.loyalty_accounts (tenant_id, client_id)
  values (new.tenant_id, new.client_id)
  on conflict (tenant_id, client_id) do nothing;

  update public.loyalty_accounts a
  set
    current_points = a.current_points + new.delta_points,
    lifetime_points = a.lifetime_points
                      + case when new.delta_points > 0 and new.reason <> 'expiry'
                             then new.delta_points else 0 end,
    last_earn_at   = case when new.delta_points > 0 then now() else a.last_earn_at end,
    last_redeem_at = case when new.reason = 'redemption' then now() else a.last_redeem_at end,
    updated_at     = now()
  where a.tenant_id = new.tenant_id and a.client_id = new.client_id
  returning lifetime_points, current_points into _new_lifetime, _new_current;

  -- recompute tier (thresholds match the strategy doc)
  _new_tier := case
    when _new_lifetime >= 10000 then 'inner_circle'
    when _new_lifetime >=  1500 then 'insider'
    else 'friend'
  end;

  update public.loyalty_accounts
  set tier = _new_tier,
      tier_reached_at = case when tier <> _new_tier then now() else tier_reached_at end
  where tenant_id = new.tenant_id and client_id = new.client_id;

  return new;
end $$;

drop trigger if exists trg_ledger_apply on public.loyalty_ledger;
create trigger trg_ledger_apply
after insert on public.loyalty_ledger
for each row execute function public.apply_ledger_to_account();

-- =====================================================
-- HELPER FUNCTIONS — to be called by edge functions / app code
-- =====================================================

-- Issue a welcome bonus (called once on portal sign-up).
create or replace function public.loyalty_grant_welcome(p_tenant uuid, p_client uuid)
returns void language plpgsql as $$
begin
  if exists (
    select 1 from public.loyalty_ledger
    where tenant_id = p_tenant and client_id = p_client and reason = 'welcome_bonus'
  ) then
    return;  -- idempotent
  end if;
  insert into public.loyalty_ledger (tenant_id, client_id, delta_points, reason, expires_at, display_label)
  values (p_tenant, p_client, 100, 'welcome_bonus', now() + interval '12 months', 'Welcome to The Inner Circle');
end $$;

-- Credit booking-completion points (called when a booking flips to 'completed').
create or replace function public.loyalty_credit_booking(p_booking uuid)
returns void language plpgsql as $$
declare
  b record;
  pts int;
begin
  select b.* into b
  from public.bookings b where b.id = p_booking;
  if b is null or b.status <> 'completed' then return; end if;

  -- 10 points per pound of price_pence
  pts := greatest(coalesce(b.price_pence,0) / 10, 0);
  if pts <= 0 then return; end if;

  -- idempotency: skip if already credited
  if exists (
    select 1 from public.loyalty_ledger
    where booking_id = p_booking and reason = 'booking_completed'
  ) then return; end if;

  insert into public.loyalty_ledger
    (tenant_id, client_id, delta_points, reason, booking_id, expires_at, display_label)
  values
    (b.tenant_id, b.client_id, pts, 'booking_completed', p_booking,
     now() + interval '12 months',
     'Earned from your session');
end $$;

-- =====================================================
-- SEED — Astrabody starter rewards catalogue
-- =====================================================
-- These match the Astrabody_Loyalty_Strategy.md menu. For each new
-- tenant you'd run a similar seed scoped to their tenant_id.
do $$
declare
  _tid uuid;
begin
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then return; end if;

  insert into public.loyalty_rewards
    (tenant_id, slug, name, description, cost_points, kind, value_pence, percent_value, min_tier, sort_order)
  values
    (_tid, 'discount-5gbp',     '£5 off your next session',          'Apply at checkout, valid 90 days',      500,  'discount_pence', 500,  null, 'friend',       10),
    (_tid, 'free-infrabike',    'Free InfraBike session',             '30 minutes, your favourite programme',  1500, 'free_service',   3900, null, 'friend',       20),
    (_tid, 'percent-20-ff',     '20% off a Fat Freezing zone',        'Single zone, redeem on any pack',       2500, 'percent_off',    null, 20,   'friend',       30),
    (_tid, 'gift-friend-trial', 'Gift a friend a free trial',         'She gets a free InfraBike, you get +200 if she shows up', 4000, 'gift_friend_session', 3900, null, 'friend', 40),
    (_tid, 'free-ems',          'Free EMS SupraSculpt session',       '30 minutes, full body programme',       6000, 'free_service',   8000, null, 'insider',      50),
    (_tid, 'free-fat-freezing', 'Free Fat Freezing session, 1 zone',  'Single zone, M3Pro 360°',                10000,'free_service',  16000,null, 'insider',      60),
    (_tid, 'sculpt-day',        'Sculpt Day experience',              'InfraBike + EMS + Fat Freezing 1 zone, in one afternoon', 15000, 'experience', null, null, 'inner_circle', 70)
  on conflict (tenant_id, slug) do nothing;
end $$;

-- =====================================================
-- DONE.
-- =====================================================
