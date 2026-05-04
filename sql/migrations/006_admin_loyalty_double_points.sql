-- =====================================================
-- Astrabody Platform — Migration 006
-- "Double Points week" tenant flag
-- =====================================================
-- Adds a single column on public.tenants to drive the Double Points
-- toggle on /admin/loyalty:
--
--   loyalty_double_points_until timestamptz
--
-- When the column is non-null and > now(), the loyalty earn path
-- (loyalty_credit_booking) doubles the points for completed bookings
-- in this tenant. Wiring the doubling logic into the trigger lives in
-- a follow-up — for now the UI toggle reads/writes the column.
-- =====================================================

alter table public.tenants
  add column if not exists loyalty_double_points_until timestamptz;

create index if not exists idx_tenants_double_points
  on public.tenants(loyalty_double_points_until)
  where loyalty_double_points_until is not null;

-- =====================================================
-- DONE.
-- =====================================================
