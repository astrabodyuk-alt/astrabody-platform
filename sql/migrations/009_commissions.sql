-- =====================================================
-- Astrabody Platform — Migration 009
-- Per-staff sales commissions
-- =====================================================
-- Three pieces:
--   A. Schema additions: staff.commission_rate_pct +
--      bookings.sold_by_staff_id + new commissions table.
--   B. Triggers:
--      - BEFORE INSERT on bookings: default sold_by_staff_id = staff_id
--        when null (covers the booking-flow path that doesn't pass it).
--      - AFTER INSERT/UPDATE OF status on bookings:
--          * insert commissions row when transitioning into 'confirmed'
--            (snapshot the rate from staff.commission_rate_pct at that
--            moment — never read it live later).
--          * void commissions row when transitioning out of 'confirmed'
--            into 'cancelled'.
--   C. Backfill: existing bookings get sold_by_staff_id = staff_id
--      (a no-op on net), and confirmed/completed/cancelled rows get
--      a commissions row inserted (idempotent on booking_id unique).
-- =====================================================

-- A. Schema additions ---------------------------------

alter table public.staff
  add column if not exists commission_rate_pct numeric(5,2) not null default 10.00;

alter table public.bookings
  add column if not exists sold_by_staff_id uuid references public.staff(id);

create index if not exists bookings_sold_by_idx
  on public.bookings(sold_by_staff_id, status);

create table if not exists public.commissions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  rate_pct        numeric(5,2) not null,
  amount_pence    int not null,
  status          text not null default 'pending'
                  check (status in ('pending','paid','void')),
  paid_at         timestamptz,
  paid_by_user_id uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists commissions_staff_status_idx
  on public.commissions(staff_id, status);
create index if not exists commissions_tenant_status_idx
  on public.commissions(tenant_id, status, created_at desc);

alter table public.commissions enable row level security;
drop policy if exists commissions_tenant_isolation on public.commissions;
create policy commissions_tenant_isolation on public.commissions
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- B. Triggers -----------------------------------------

create or replace function public.set_booking_sold_by()
returns trigger language plpgsql as $$
begin
  if new.sold_by_staff_id is null then
    new.sold_by_staff_id := new.staff_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_sold_by on public.bookings;
create trigger trg_bookings_sold_by
  before insert on public.bookings
  for each row execute function public.set_booking_sold_by();

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
  -- New row going straight to 'confirmed' (free booking flow), or
  -- transition from anything-not-confirmed → 'confirmed' (Stripe path).
  if (tg_op = 'INSERT' and new.status = 'confirmed') or
     (tg_op = 'UPDATE' and new.status = 'confirmed'
        and (old.status is null or old.status <> 'confirmed')) then
    _staff_id := coalesce(new.sold_by_staff_id, new.staff_id);
    select commission_rate_pct into _rate
    from public.staff where id = _staff_id;
    if _rate is null then _rate := 10.00; end if;
    _amount := round(coalesce(new.price_pence, 0)::numeric * _rate / 100)::int;
    insert into public.commissions
      (tenant_id, booking_id, staff_id, rate_pct, amount_pence, status)
    values
      (new.tenant_id, new.id, _staff_id, _rate, _amount, 'pending')
    on conflict (booking_id) do nothing;
  end if;

  -- Cancellation after confirmed → void the commission (don't delete,
  -- keep the audit row).
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status = 'confirmed' then
    update public.commissions
      set status = 'void'
      where booking_id = new.id and status <> 'paid';
  end if;

  return new;
end $$;

drop trigger if exists trg_bookings_sync_commissions on public.bookings;
create trigger trg_bookings_sync_commissions
  after insert or update of status on public.bookings
  for each row execute function public.sync_commissions_for_booking();

-- C. Backfill -----------------------------------------

-- 1. Default sold_by on every existing booking.
update public.bookings
  set sold_by_staff_id = staff_id
  where sold_by_staff_id is null;

-- 2. Issue commissions rows for already-confirmed / completed / cancelled
--    bookings. Cancelled rows go in as 'void' so the totals match.
insert into public.commissions
  (tenant_id, booking_id, staff_id, rate_pct, amount_pence, status)
select
  b.tenant_id,
  b.id,
  coalesce(b.sold_by_staff_id, b.staff_id),
  coalesce(s.commission_rate_pct, 10.00),
  round(coalesce(b.price_pence, 0)::numeric
        * coalesce(s.commission_rate_pct, 10.00) / 100)::int,
  case when b.status = 'cancelled' then 'void' else 'pending' end
from public.bookings b
left join public.staff s
  on s.id = coalesce(b.sold_by_staff_id, b.staff_id)
where b.status in ('confirmed', 'completed', 'cancelled')
on conflict (booking_id) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
