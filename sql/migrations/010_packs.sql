-- =====================================================
-- Astrabody Platform — Migration 010
-- Multi-session packs (sold in-studio)
-- =====================================================
-- Front-desk packs: staff sell N sessions on the spot, the client's
-- account is credited with `sessions_remaining`, and bookings consume
-- those sessions instead of triggering a Stripe checkout.
--
-- Schema:
--   A. service_packages — catalogue per tenant
--   B. client_packages  — credit balance per client
--   C. package_purchases — sale ledger (cash / card terminal / bank /
--                          stripe / gift / other)
--   D. bookings.client_package_id — pointer to source pack when consumed
--   E. commissions schema changes — accept package_purchase_id source
--      with a partial unique index on each id and an XOR check.
-- Triggers:
--   1. AFTER INSERT package_purchases → commissions row (snapshot rate)
--   2. AFTER UPDATE OF refunded ON package_purchases → void commission +
--      cancel client_package
--   3. AFTER INSERT bookings WHERE client_package_id IS NOT NULL →
--      decrement sessions_remaining; flip status='consumed' on zero.
--   4. AFTER UPDATE OF status ON bookings WHERE client_package_id IS NOT
--      NULL AND NEW.status='cancelled' → restore one session; flip
--      'consumed' → 'active' if applicable.
-- Functions:
--   - public.expire_pending_packs() — daily sweep, called by pg_cron or
--     an application-level scheduler.
-- Seed: 4 service_packages for tenant 'astrabody', idempotent on
-- (tenant_id, name).
-- =====================================================

-- A. service_packages -----------------------------------

create table if not exists public.service_packages (
  id                 uuid primary key default uuid_generate_v4(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  service_id         uuid not null references public.services(id) on delete cascade,
  name               text not null,
  short_description  text,
  sessions_count     int  not null check (sessions_count > 0),
  price_pence        int  not null check (price_pence >= 0),
  validity_months    int  not null default 6 check (validity_months > 0),
  is_active          boolean not null default true,
  sort_order         int  not null default 100,
  created_at         timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists service_packages_tenant_active_idx
  on public.service_packages(tenant_id, is_active, sort_order);

alter table public.service_packages enable row level security;
drop policy if exists service_packages_tenant_isolation on public.service_packages;
create policy service_packages_tenant_isolation on public.service_packages
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- B. client_packages ------------------------------------

create table if not exists public.client_packages (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete cascade,
  package_id          uuid not null references public.service_packages(id) on delete restrict,
  service_id          uuid not null references public.services(id) on delete restrict,
  sessions_total      int  not null check (sessions_total > 0),
  sessions_remaining  int  not null check (sessions_remaining >= 0),
  expires_at          timestamptz not null,
  status              text not null default 'active'
                      check (status in ('active','expired','cancelled','consumed')),
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists client_packages_client_active_idx
  on public.client_packages(client_id, status)
  where status = 'active';

create index if not exists client_packages_tenant_status_idx
  on public.client_packages(tenant_id, status, expires_at);

alter table public.client_packages enable row level security;
drop policy if exists client_packages_tenant_isolation on public.client_packages;
create policy client_packages_tenant_isolation on public.client_packages
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- Portal-client read: a client can SELECT her own packs.
drop policy if exists client_packages_portal_read on public.client_packages;
create policy client_packages_portal_read on public.client_packages
  for select using (
    client_id in (select public.current_user_client_ids())
  );

-- C. package_purchases ----------------------------------

create table if not exists public.package_purchases (
  id                 uuid primary key default uuid_generate_v4(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  client_package_id  uuid not null references public.client_packages(id) on delete restrict,
  package_id         uuid not null references public.service_packages(id) on delete restrict,
  client_id          uuid not null references public.clients(id) on delete restrict,
  sold_by_staff_id   uuid not null references public.staff(id) on delete restrict,
  amount_paid_pence  int  not null check (amount_paid_pence >= 0),
  payment_method     text not null check (payment_method in (
                       'cash','card_terminal','bank_transfer',
                       'stripe_online','gift','other'
                     )),
  reference          text,
  notes              text,
  refunded           boolean not null default false,
  refunded_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists package_purchases_tenant_created_idx
  on public.package_purchases(tenant_id, created_at desc);
create index if not exists package_purchases_staff_idx
  on public.package_purchases(sold_by_staff_id, created_at desc);
create index if not exists package_purchases_client_idx
  on public.package_purchases(client_id, created_at desc);

alter table public.package_purchases enable row level security;
drop policy if exists package_purchases_tenant_isolation on public.package_purchases;
create policy package_purchases_tenant_isolation on public.package_purchases
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- D. bookings.client_package_id ------------------------

alter table public.bookings
  add column if not exists client_package_id uuid references public.client_packages(id);

create index if not exists bookings_client_package_idx
  on public.bookings(client_package_id)
  where client_package_id is not null;

-- E. commissions schema changes ------------------------
-- Existing 009 had unique(booking_id) + booking_id NOT NULL. Pack-source
-- commissions will have booking_id NULL and package_purchase_id set, so
-- relax the column nullability and replace the single uniqueness with
-- two partial unique indexes + an XOR check.

alter table public.commissions
  add column if not exists package_purchase_id uuid
    references public.package_purchases(id) on delete cascade;

alter table public.commissions
  alter column booking_id drop not null;

-- Drop the old unique constraint (added inline in 009) if present.
alter table public.commissions
  drop constraint if exists commissions_booking_id_key;

create unique index if not exists commissions_booking_unique
  on public.commissions(booking_id) where booking_id is not null;
create unique index if not exists commissions_package_unique
  on public.commissions(package_purchase_id) where package_purchase_id is not null;

-- Exactly one source must be set (XOR).
alter table public.commissions
  drop constraint if exists commissions_source_check;
alter table public.commissions
  add constraint commissions_source_check
    check ((booking_id is not null) <> (package_purchase_id is not null));

create index if not exists commissions_purchase_status_idx
  on public.commissions(package_purchase_id, status)
  where package_purchase_id is not null;

-- F0. Adapt the existing booking-side commissions function to the new
-- partial-unique index. The `on conflict (booking_id)` clause from 009
-- referenced a constraint we just dropped — it now needs to match the
-- partial index `commissions_booking_unique` instead. Pure SQL change,
-- no behaviour difference for callers.

create or replace function public.sync_commissions_for_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _rate numeric(5,2);
  _staff_id uuid;
  _amount int;
begin
  if (tg_op = 'INSERT' and new.status = 'confirmed') or
     (tg_op = 'UPDATE' and new.status = 'confirmed'
        and (old.status is null or old.status <> 'confirmed')) then
    -- Bookings backed by a pack already paid the staff via the pack
    -- purchase commission — don't double-pay on the consumption side.
    if new.client_package_id is not null then
      return new;
    end if;
    _staff_id := coalesce(new.sold_by_staff_id, new.staff_id);
    select commission_rate_pct into _rate
    from public.staff where id = _staff_id;
    if _rate is null then _rate := 10.00; end if;
    _amount := round(coalesce(new.price_pence, 0)::numeric * _rate / 100)::int;
    insert into public.commissions
      (tenant_id, booking_id, staff_id, rate_pct, amount_pence, status)
    values
      (new.tenant_id, new.id, _staff_id, _rate, _amount, 'pending')
    on conflict (booking_id) where booking_id is not null do nothing;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status = 'confirmed' then
    update public.commissions
      set status = 'void'
      where booking_id = new.id and status <> 'paid';
  end if;

  return new;
end $$;

-- F. Triggers ------------------------------------------

-- 1. On insert into package_purchases → commission row.
create or replace function public.commissions_for_package_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _rate numeric(5,2);
  _amount int;
begin
  select commission_rate_pct into _rate
  from public.staff where id = new.sold_by_staff_id;
  if _rate is null then _rate := 10.00; end if;
  _amount := round(coalesce(new.amount_paid_pence, 0)::numeric * _rate / 100)::int;

  insert into public.commissions
    (tenant_id, package_purchase_id, staff_id, rate_pct, amount_pence, status)
  values
    (new.tenant_id, new.id, new.sold_by_staff_id, _rate, _amount, 'pending')
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists trg_package_purchases_commission on public.package_purchases;
create trigger trg_package_purchases_commission
  after insert on public.package_purchases
  for each row execute function public.commissions_for_package_purchase();

-- 2. On refund → void commission + cancel client_package.
create or replace function public.handle_package_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.refunded = true and old.refunded = false then
    update public.client_packages
      set status = 'cancelled'
      where id = new.client_package_id and status <> 'cancelled';
    update public.commissions
      set status = 'void'
      where package_purchase_id = new.id and status <> 'paid';
  end if;
  return new;
end $$;

drop trigger if exists trg_package_purchases_refund on public.package_purchases;
create trigger trg_package_purchases_refund
  after update of refunded on public.package_purchases
  for each row execute function public.handle_package_refund();

-- 3. On bookings insert with a client_package_id → decrement.
create or replace function public.consume_pack_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _remaining int;
begin
  if new.client_package_id is null then
    return new;
  end if;
  update public.client_packages
    set sessions_remaining = sessions_remaining - 1,
        status = case
                   when sessions_remaining - 1 <= 0 then 'consumed'
                   else status
                 end
    where id = new.client_package_id
    returning sessions_remaining into _remaining;
  return new;
end $$;

drop trigger if exists trg_bookings_consume_pack on public.bookings;
create trigger trg_bookings_consume_pack
  after insert on public.bookings
  for each row execute function public.consume_pack_session();

-- 4. On booking cancellation → restore one session.
create or replace function public.restore_pack_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_package_id is null then
    return new;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.client_packages
      set sessions_remaining = sessions_remaining + 1,
          status = case
                     when status = 'consumed' then 'active'
                     when status = 'expired' then status
                     else status
                   end
      where id = new.client_package_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_restore_pack on public.bookings;
create trigger trg_bookings_restore_pack
  after update of status on public.bookings
  for each row execute function public.restore_pack_session();

-- Daily sweep — call from pg_cron or an external scheduler.
create or replace function public.expire_pending_packs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _count int;
begin
  update public.client_packages
    set status = 'expired'
    where status = 'active'
      and expires_at < now()
      and sessions_remaining > 0;
  get diagnostics _count = row_count;
  return _count;
end $$;

-- G. Seed -----------------------------------------------
-- Idempotent on (tenant_id, name).

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
),
svcs as (
  select s.id, s.slug from public.services s
  where s.tenant_id = (select tenant_id from t)
)
insert into public.service_packages
  (tenant_id, service_id, name, short_description, sessions_count,
   price_pence, validity_months, is_active, sort_order)
select
  (select tenant_id from t),
  (select id from svcs where slug = src.svc_slug),
  src.pack_name,
  src.short_desc,
  src.sessions_count,
  src.price_pence,
  src.validity,
  true,
  src.sort_order
from (values
  ('infrabike',          'Pack 4 InfraBike',           '4 sessions · warm-up pack',          4,  11900, 6,  10),
  ('infrabike',          'Pack 10 InfraBike',          '10 sessions · best value',          10,  23900, 6,  20),
  ('ems-suprasculpt',    'Pack 8 EMS',                 '8 sessions · full sculpt cycle',     8,  51900, 6,  30),
  ('fat-freezing-zone',  'Pack Fat Freezing 3 rounds', '3 rounds · up to 3 zones each',      3,  69900, 12, 40)
) as src(svc_slug, pack_name, short_desc, sessions_count, price_pence, validity, sort_order)
where (select tenant_id from t) is not null
  and (select id from svcs where slug = src.svc_slug) is not null
on conflict (tenant_id, name) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
