-- =====================================================
-- Astrabody Platform — Seed 02
-- Staff (Tove, Jade, Nigel) and staff_services mappings
-- =====================================================
-- Idempotent. Safe to re-run.
-- Names from /Astrabody/CLAUDE.md §1 (founder + team).
-- All three staff are mapped to every bookable service for V1.
-- Sort order makes Tove the default ("first staff_services row by sort_order").
-- Nigel can edit roles/availability through the admin UI later.
-- =====================================================

do $$
declare
  _tid   uuid;
  _tove  uuid;
  _jade  uuid;
  _nigel uuid;
begin
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then
    raise exception 'astrabody tenant not found, run migration 001 first';
  end if;

  -- Staff (no unique constraint on (tenant_id, display_name), so we look up first)
  select id into _tove
    from public.staff where tenant_id = _tid and display_name = 'Tove' limit 1;
  if _tove is null then
    insert into public.staff (tenant_id, display_name, sort_order, is_active)
    values (_tid, 'Tove', 10, true)
    returning id into _tove;
  end if;

  select id into _jade
    from public.staff where tenant_id = _tid and display_name = 'Jade' limit 1;
  if _jade is null then
    insert into public.staff (tenant_id, display_name, sort_order, is_active)
    values (_tid, 'Jade', 20, true)
    returning id into _jade;
  end if;

  select id into _nigel
    from public.staff where tenant_id = _tid and display_name = 'Nigel' limit 1;
  if _nigel is null then
    insert into public.staff (tenant_id, display_name, sort_order, is_active)
    values (_tid, 'Nigel', 30, true)
    returning id into _nigel;
  end if;

  -- Map every bookable service to every staff member.
  -- PK on staff_services is (staff_id, service_id), so on conflict do nothing.
  insert into public.staff_services (staff_id, service_id, tenant_id)
  select s.id, sv.id, _tid
  from (values (_tove), (_jade), (_nigel)) as s(id)
  cross join public.services sv
  where sv.tenant_id = _tid and sv.is_bookable = true
  on conflict (staff_id, service_id) do nothing;
end $$;

-- =====================================================
-- Expected: 3 rows in public.staff, 18 rows in public.staff_services
-- (3 staff × 6 bookable services).
-- =====================================================
