-- =====================================================
-- Astrabody Platform — Migration 004
-- Portal-client read access for the booking flow
-- =====================================================
-- Diagnosis (2026-04-28): /portal/book rendered "no services" for Nigel
-- on his first booking attempt. The data was seeded correctly (12
-- services in public.services, 6 bookable). The bug was RLS:
--
-- public.services has only services_tenant_isolation, which requires
-- tenant_id in current_user_tenant_ids(). That helper reads from
-- public.tenant_members (the staff side). A portal client signs in via
-- public.client_portal_links, has zero rows in tenant_members, and so
-- the policy returns empty for every SELECT.
--
-- Same gap exists on public.staff, public.staff_services,
-- public.working_hours, public.time_off — every table the booking flow
-- needs to read.
--
-- public.loyalty_rewards already has the right pattern in 003 (the
-- rewards_read policy with an exists check on client_portal_links).
-- This migration mirrors that pattern for the booking-flow tables.
-- =====================================================

-- Helper: tenant_ids the current auth user belongs to AS A PORTAL CLIENT.
-- Runs as security definer so it can read client_portal_links regardless
-- of the caller's RLS context.
create or replace function public.current_user_portal_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.client_portal_links
  where user_id = auth.uid();
$$;

-- services: portal clients can SELECT bookable services for their tenant.
drop policy if exists services_portal_read on public.services;
create policy services_portal_read on public.services
  for select using (
    is_bookable = true
    and tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- staff: portal clients can SELECT active staff for their tenant.
-- (Needed because the booking page resolves staff names + emails for the
--  default-staff display, and to satisfy nested embeds via PostgREST.)
drop policy if exists staff_portal_read on public.staff;
create policy staff_portal_read on public.staff
  for select using (
    is_active = true
    and tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- staff_services: portal clients can read the staff <-> service mapping
-- for their tenant. This is what getDefaultStaffForService() needs.
drop policy if exists staff_services_portal_read on public.staff_services;
create policy staff_services_portal_read on public.staff_services
  for select using (
    tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- working_hours: portal clients can read working hours for their tenant.
-- The /api/availability route depends on this.
drop policy if exists working_hours_portal_read on public.working_hours;
create policy working_hours_portal_read on public.working_hours
  for select using (
    tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- time_off: portal clients can read time-off blocks for their tenant.
-- (Knowing a staff member is unavailable on a given day is not sensitive;
--  it's the same information they'd see by trying every slot.)
drop policy if exists time_off_portal_read on public.time_off;
create policy time_off_portal_read on public.time_off
  for select using (
    tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- =====================================================
-- DONE.
--
-- Note on bookings: we deliberately do NOT add a portal-tenant-wide read
-- policy for bookings here. Portal clients keep bookings_client_self
-- (their own bookings only). The cross-client overlap check inside
-- /api/availability uses the admin (service-role) client instead, so a
-- portal client can never see another client's booking details.
-- =====================================================
