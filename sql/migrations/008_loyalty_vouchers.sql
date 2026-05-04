-- =====================================================
-- Astrabody Platform — Migration 008
-- Loyalty vouchers + booking discount audit columns
-- =====================================================
-- Adds the missing piece between the points ledger and the rewards
-- catalogue: ad-hoc vouchers issued for specific events (google
-- review, referral, manual admin grant, tier unlock).
--
-- Vouchers stack with points and with each other under one rule:
-- a free_service voucher matching the booked service short-circuits
-- the rest. Otherwise discounts compound additively (see
-- src/app/portal/book/[serviceId]/checkout/actions.ts for the live
-- combiner).
-- =====================================================

create table if not exists public.loyalty_vouchers (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  kind            text not null check (kind in ('percent','amount','free_service')),
  value_pct       int,
  value_pence     int,
  service_id      uuid references public.services(id) on delete cascade,
  source          text not null check (source in (
                    'google_review',
                    'referral',
                    'manual_admin',
                    'tier_unlock'
                  )),
  status          text not null default 'active' check (status in (
                    'active','redeemed','expired'
                  )),
  redemption_id   uuid references public.loyalty_redemptions(id) on delete set null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists loyalty_vouchers_client_active_idx
  on public.loyalty_vouchers(client_id, status)
  where status = 'active';

create index if not exists loyalty_vouchers_tenant_active_idx
  on public.loyalty_vouchers(tenant_id, status)
  where status = 'active';

-- RLS: clients see their own active vouchers. Writes are admin-only
-- (vouchers come from triggers, admin actions, or staff issuance).
alter table public.loyalty_vouchers enable row level security;

drop policy if exists vouchers_self_read on public.loyalty_vouchers;
create policy vouchers_self_read on public.loyalty_vouchers
  for select using (client_id in (select public.current_user_client_ids()));

drop policy if exists vouchers_staff on public.loyalty_vouchers;
create policy vouchers_staff on public.loyalty_vouchers
  for select using (tenant_id in (select public.current_user_tenant_ids()));

-- =====================================================
-- Audit columns on bookings
-- =====================================================
-- We persist exactly which vouchers were applied + how many points
-- were spent so a refund / reversal can re-issue the credits cleanly.

alter table public.bookings
  add column if not exists applied_voucher_ids uuid[] not null default array[]::uuid[],
  add column if not exists points_spent int not null default 0;

create index if not exists bookings_applied_vouchers_gin
  on public.bookings using gin (applied_voucher_ids);

-- =====================================================
-- DONE.
-- =====================================================
