-- =====================================================
-- Astrabody Platform — Seed 03
-- Working hours for the Astrabody staff
-- =====================================================
-- Per /Astrabody/CLAUDE.md §4:
--   Mon–Fri  08:00 – 21:00 (sur rendez-vous)
--   Sat      08:00 – 17:00 (sur rendez-vous)
--   Sun      Fermé
--
-- weekday: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
--
-- The schema has no unique key on (staff_id, weekday), so this seed deletes
-- any existing rows for the Astrabody tenant first, then re-inserts the
-- canonical set. Safe to re-run.
-- =====================================================

do $$
declare
  _tid uuid;
  _staff record;
  _weekday int;
  _start time;
  _end   time;
begin
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then
    raise exception 'astrabody tenant not found, run migration 001 first';
  end if;

  -- Reset to keep the seed idempotent.
  delete from public.working_hours where tenant_id = _tid;

  for _staff in
    select id from public.staff where tenant_id = _tid and is_active = true
  loop
    -- Monday (1) through Friday (5): 08:00–21:00
    foreach _weekday in array array[1, 2, 3, 4, 5] loop
      insert into public.working_hours (tenant_id, staff_id, weekday, start_time, end_time)
      values (_tid, _staff.id, _weekday, time '08:00', time '21:00');
    end loop;

    -- Saturday (6): 08:00–17:00
    insert into public.working_hours (tenant_id, staff_id, weekday, start_time, end_time)
    values (_tid, _staff.id, 6, time '08:00', time '17:00');

    -- Sunday (0): closed (no row).
  end loop;
end $$;

-- =====================================================
-- Expected: 18 rows (3 staff × 6 working days).
-- =====================================================
