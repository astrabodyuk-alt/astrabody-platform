-- =====================================================
-- Astrabody Platform — Migration 020
-- Wire double-points into loyalty_credit_booking()
-- =====================================================
-- Migration 003 created the function but ignored the
-- loyalty_double_points_until flag added in migration 006.
-- This replaces the function so:
--   • double-points weeks are honoured at earn time
--   • the display_label reflects the multiplier so the
--     client sees "Earned from your session (×2)" in their wallet
-- =====================================================

create or replace function public.loyalty_credit_booking(p_booking uuid)
returns void language plpgsql security definer as $$
declare
  b  record;
  t  record;
  pts int;
  multiplier int := 1;
  label text;
begin
  -- Load the booking; guard against missing / wrong status
  select * into b from public.bookings where id = p_booking;
  if b is null or b.status <> 'completed' then return; end if;

  -- Idempotency: skip if a booking_completed ledger row already exists
  if exists (
    select 1 from public.loyalty_ledger
    where booking_id = p_booking
      and reason = 'booking_completed'
  ) then return; end if;

  -- Base points: 10 pts per £  (price_pence / 10)
  pts := greatest(coalesce(b.price_pence, 0) / 10, 0);
  if pts <= 0 then return; end if;

  -- Check whether the tenant has an active double-points event
  select * into t from public.tenants where id = b.tenant_id;
  if t.loyalty_double_points_until is not null
     and t.loyalty_double_points_until > now() then
    multiplier := 2;
    pts        := pts * 2;
  end if;

  -- Build the wallet label
  if multiplier = 2 then
    label := 'Earned from your session (×2 double points week)';
  else
    label := 'Earned from your session';
  end if;

  insert into public.loyalty_ledger
    (tenant_id, client_id, delta_points, reason,
     booking_id, expires_at, display_label)
  values
    (b.tenant_id, b.client_id, pts, 'booking_completed',
     p_booking, now() + interval '12 months', label);
end $$;

-- =====================================================
-- DONE.
-- =====================================================
