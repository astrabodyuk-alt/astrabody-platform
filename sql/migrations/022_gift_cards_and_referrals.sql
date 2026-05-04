-- =====================================================
-- Astrabody Platform — Migration 022
-- E-gift cards + client referral programme
-- =====================================================
-- gift_cards: client-purchased balance instruments redeemable at
-- /portal/book checkout. Partial redemption supported, owner can
-- issue manual cards (compensation) or void existing ones.
--
-- referrals: one-shot referral_code per client; visiting /portal/book
-- with ?ref=<code> drops a session cookie that's claimed on first
-- booking. Both sides earn loyalty credit when the referred client's
-- first booking is marked completed.
-- =====================================================

-- -----------------------------------------------------
-- GIFT_CARDS
-- -----------------------------------------------------
create table if not exists public.gift_cards (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  code                     text not null unique,
  initial_pence            int not null,
  balance_pence            int not null,
  purchased_by             uuid references public.clients(id) on delete set null,
  recipient_email          text,
  recipient_name           text,
  personal_message         text,
  stripe_payment_intent_id text,
  redeemed_by              uuid references public.clients(id) on delete set null,
  redeemed_at              timestamptz,
  voided_at                timestamptz,
  voided_by_user_id        uuid references auth.users(id),
  expires_at               timestamptz not null default (now() + interval '12 months'),
  created_at               timestamptz not null default now(),
  check (balance_pence >= 0),
  check (balance_pence <= initial_pence),
  check (initial_pence > 0)
);

create index if not exists gift_cards_tenant_code_idx
  on public.gift_cards(tenant_id, upper(code));

create index if not exists gift_cards_active_expiry_idx
  on public.gift_cards(tenant_id, expires_at)
  where balance_pence > 0;

create index if not exists gift_cards_recipient_email_idx
  on public.gift_cards(tenant_id, recipient_email)
  where recipient_email is not null;

alter table public.gift_cards enable row level security;

-- Owner / admin: full visibility.
drop policy if exists gift_cards_admin_select on public.gift_cards;
create policy gift_cards_admin_select on public.gift_cards
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- Client: see their own purchases or redemptions via the portal link.
drop policy if exists gift_cards_client_select on public.gift_cards;
create policy gift_cards_client_select on public.gift_cards
  for select using (
    purchased_by in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
    or redeemed_by in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
  );

-- INSERT / UPDATE: service-role only — actions bypass RLS via the admin client.

-- -----------------------------------------------------
-- CLIENT REFERRAL_CODE
-- -----------------------------------------------------
alter table public.clients
  add column if not exists referral_code text;

-- Case-insensitive uniqueness — codes are upper-cased on insert but the
-- expression index makes lookups by lower(...) safe both ways.
create unique index if not exists clients_referral_code_unique_idx
  on public.clients(upper(referral_code))
  where referral_code is not null;

-- -----------------------------------------------------
-- REFERRALS
-- -----------------------------------------------------
create table if not exists public.referrals (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  referrer_client_id       uuid not null references public.clients(id) on delete cascade,
  referred_client_id       uuid references public.clients(id) on delete set null,
  referral_code            text not null,
  status                   text not null default 'pending'
                             check (status in ('pending','converted','rewarded')),
  converted_at             timestamptz,
  rewarded_at              timestamptz,
  referrer_credit_pence    int not null default 1000,
  referred_credit_pence    int not null default 1000,
  created_at               timestamptz not null default now()
);

-- One referrals row per (tenant, referred client) — guards against a
-- client being claimed twice if they hit the link from multiple devices.
create unique index if not exists referrals_referred_unique_idx
  on public.referrals(tenant_id, referred_client_id)
  where referred_client_id is not null;

create index if not exists referrals_referrer_idx
  on public.referrals(tenant_id, referrer_client_id, status);

create index if not exists referrals_status_idx
  on public.referrals(tenant_id, status, created_at desc);

alter table public.referrals enable row level security;

-- Owner / admin: full visibility.
drop policy if exists referrals_admin_select on public.referrals;
create policy referrals_admin_select on public.referrals
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- Client: see referrals where they are referrer or referred.
drop policy if exists referrals_client_select on public.referrals;
create policy referrals_client_select on public.referrals
  for select using (
    referrer_client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
    or referred_client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
  );

-- INSERT / UPDATE: service-role only.

-- -----------------------------------------------------
-- TENANT REFERRAL SETTINGS
-- -----------------------------------------------------
alter table public.tenants
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_referrer_pence int not null default 1000,
  add column if not exists referral_referred_pence int not null default 1000,
  add column if not exists referral_min_booking_pence int not null default 0;

-- =====================================================
-- DONE.
-- =====================================================
