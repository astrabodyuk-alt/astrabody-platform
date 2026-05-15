-- =====================================================
-- Astrabody Platform — Seed 04
-- Demo clients + bookings (current & last week)
-- =====================================================
-- Purpose: populate the admin dashboard with realistic UK data so
-- KPIs, revenue chart, session ring and schedule cards look real.
--
-- Safe to re-run (idempotent via ON CONFLICT or DELETE+INSERT).
-- Uses now() / current_date so the week-range data stays valid
-- no matter when the seed is run.
--
-- Run AFTER seeds 01–03 (services + staff must exist).
-- =====================================================

do $$
declare
  _tid       uuid;

  -- Staff IDs
  _tove      uuid;
  _jade      uuid;
  _nigel     uuid;

  -- Service IDs
  _svc_trial        uuid;
  _svc_combo        uuid;
  _svc_bike         uuid;
  _svc_ems          uuid;
  _svc_freeze       uuid;
  _svc_laser        uuid;

  -- Client IDs
  _c1  uuid; _c2  uuid; _c3  uuid; _c4  uuid; _c5  uuid;
  _c6  uuid; _c7  uuid; _c8  uuid; _c9  uuid; _c10 uuid;
  _c11 uuid; _c12 uuid; _c13 uuid; _c14 uuid; _c15 uuid;

  -- Date helpers
  _today        date := current_date;
  _tz           text := 'Europe/London';

  -- Monday of current week (ISO: week starts Mon)
  _this_mon     timestamptz;
  _last_mon     timestamptz;

  -- Helpers
  _bkg_date     date;
  _bkg_time     time;
  _bkg_ts       timestamptz;
begin

  -- ── Resolve tenant ──────────────────────────────────────────────────────────
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then
    raise exception 'astrabody tenant not found — run migrations first';
  end if;

  -- ── Resolve staff ───────────────────────────────────────────────────────────
  select id into _tove  from public.staff where tenant_id = _tid and display_name = 'Tove'  limit 1;
  select id into _jade  from public.staff where tenant_id = _tid and display_name = 'Jade'  limit 1;
  select id into _nigel from public.staff where tenant_id = _tid and display_name = 'Nigel' limit 1;

  if _tove is null or _jade is null or _nigel is null then
    raise exception 'Staff not found — run seed 02 first';
  end if;

  -- ── Resolve services ────────────────────────────────────────────────────────
  select id into _svc_trial  from public.services where tenant_id = _tid and slug = 'infrabike-trial'   limit 1;
  select id into _svc_combo  from public.services where tenant_id = _tid and slug = 'trial-combo'       limit 1;
  select id into _svc_bike   from public.services where tenant_id = _tid and slug = 'infrabike'         limit 1;
  select id into _svc_ems    from public.services where tenant_id = _tid and slug = 'ems-suprasculpt'   limit 1;
  select id into _svc_freeze from public.services where tenant_id = _tid and slug = 'fat-freezing-zone' limit 1;
  select id into _svc_laser  from public.services where tenant_id = _tid and slug = 'laser-hair-removal' limit 1;

  -- ── Week anchors (Monday 00:00 London time) ─────────────────────────────────
  -- date_trunc('week', ...) gives ISO Monday
  _this_mon := date_trunc('week', now() at time zone _tz) at time zone _tz;
  _last_mon := _this_mon - interval '7 days';

  -- ── Clients ─────────────────────────────────────────────────────────────────
  -- Clean up previous demo data to stay idempotent
  delete from public.clients
  where tenant_id = _tid
    and email like '%demo-astrabody%';

  insert into public.clients
    (tenant_id, full_name, email, phone, is_active, source, created_at)
  values
    (_tid, 'Sophie Harrison',  'sophie.harrison@demo-astrabody.co.uk',  '+447700100001', true, 'instagram',    now() - interval '6 months'),
    (_tid, 'Emily Clarke',     'emily.clarke@demo-astrabody.co.uk',     '+447700100002', true, 'referral',     now() - interval '5 months'),
    (_tid, 'Charlotte Webb',   'charlotte.webb@demo-astrabody.co.uk',   '+447700100003', true, 'google',       now() - interval '4 months'),
    (_tid, 'Amelia Foster',    'amelia.foster@demo-astrabody.co.uk',    '+447700100004', true, 'meta_ads',     now() - interval '4 months'),
    (_tid, 'Olivia Reed',      'olivia.reed@demo-astrabody.co.uk',      '+447700100005', true, 'instagram',    now() - interval '3 months'),
    (_tid, 'Isabella Marsh',   'isabella.marsh@demo-astrabody.co.uk',   '+447700100006', true, 'walk_in',      now() - interval '3 months'),
    (_tid, 'Grace Thornton',   'grace.thornton@demo-astrabody.co.uk',   '+447700100007', true, 'referral',     now() - interval '2 months'),
    (_tid, 'Mia Sanderson',    'mia.sanderson@demo-astrabody.co.uk',    '+447700100008', true, 'google',       now() - interval '2 months'),
    (_tid, 'Poppy Lawson',     'poppy.lawson@demo-astrabody.co.uk',     '+447700100009', true, 'meta_ads',     now() - interval '7 weeks'),
    (_tid, 'Ruby Collins',     'ruby.collins@demo-astrabody.co.uk',     '+447700100010', true, 'instagram',    now() - interval '6 weeks'),
    (_tid, 'Hannah Morris',    'hannah.morris@demo-astrabody.co.uk',    '+447700100011', true, 'referral',     now() - interval '5 weeks'),
    (_tid, 'Lucy Jennings',    'lucy.jennings@demo-astrabody.co.uk',    '+447700100012', true, 'google',       now() - interval '4 weeks'),
    (_tid, 'Chloe Whitfield',  'chloe.whitfield@demo-astrabody.co.uk',  '+447700100013', true, 'meta_ads',     now() - interval '3 weeks'),
    (_tid, 'Freya Stevens',    'freya.stevens@demo-astrabody.co.uk',    '+447700100014', true, 'instagram',    now() - interval '2 weeks'),
    (_tid, 'Isla Griffiths',   'isla.griffiths@demo-astrabody.co.uk',   '+447700100015', true, 'referral',     now() - interval '1 week')
  returning id into _c1;

  -- Re-fetch client IDs by email (the RETURNING clause only gives last row in some PG versions)
  select id into _c1  from public.clients where tenant_id = _tid and email = 'sophie.harrison@demo-astrabody.co.uk';
  select id into _c2  from public.clients where tenant_id = _tid and email = 'emily.clarke@demo-astrabody.co.uk';
  select id into _c3  from public.clients where tenant_id = _tid and email = 'charlotte.webb@demo-astrabody.co.uk';
  select id into _c4  from public.clients where tenant_id = _tid and email = 'amelia.foster@demo-astrabody.co.uk';
  select id into _c5  from public.clients where tenant_id = _tid and email = 'olivia.reed@demo-astrabody.co.uk';
  select id into _c6  from public.clients where tenant_id = _tid and email = 'isabella.marsh@demo-astrabody.co.uk';
  select id into _c7  from public.clients where tenant_id = _tid and email = 'grace.thornton@demo-astrabody.co.uk';
  select id into _c8  from public.clients where tenant_id = _tid and email = 'mia.sanderson@demo-astrabody.co.uk';
  select id into _c9  from public.clients where tenant_id = _tid and email = 'poppy.lawson@demo-astrabody.co.uk';
  select id into _c10 from public.clients where tenant_id = _tid and email = 'ruby.collins@demo-astrabody.co.uk';
  select id into _c11 from public.clients where tenant_id = _tid and email = 'hannah.morris@demo-astrabody.co.uk';
  select id into _c12 from public.clients where tenant_id = _tid and email = 'lucy.jennings@demo-astrabody.co.uk';
  select id into _c13 from public.clients where tenant_id = _tid and email = 'chloe.whitfield@demo-astrabody.co.uk';
  select id into _c14 from public.clients where tenant_id = _tid and email = 'freya.stevens@demo-astrabody.co.uk';
  select id into _c15 from public.clients where tenant_id = _tid and email = 'isla.griffiths@demo-astrabody.co.uk';

  -- ── Clear previous demo bookings ────────────────────────────────────────────
  delete from public.bookings
  where tenant_id = _tid
    and client_id in (_c1,_c2,_c3,_c4,_c5,_c6,_c7,_c8,_c9,_c10,_c11,_c12,_c13,_c14,_c15);

  -- ── THIS WEEK bookings (Mon → today, all confirmed/completed) ───────────────
  -- Monday
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    (_tid, _c1, _tove,  _svc_bike,   _this_mon + interval '9 hours',              _this_mon + interval '9 hours 30 min',  'completed', 3900),
    (_tid, _c2, _jade,  _svc_ems,    _this_mon + interval '10 hours',             _this_mon + interval '10 hours 30 min', 'completed', 8000),
    (_tid, _c3, _tove,  _svc_laser,  _this_mon + interval '11 hours',             _this_mon + interval '11 hours 30 min', 'completed', 2500),
    (_tid, _c4, _nigel, _svc_freeze, _this_mon + interval '13 hours',             _this_mon + interval '13 hours 45 min', 'completed', 16000);

  -- Tuesday
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    (_tid, _c5,  _tove,  _svc_trial,  _this_mon + interval '1 day 9 hours',        _this_mon + interval '1 day 9 hours 30 min',  'completed', 0),
    (_tid, _c6,  _jade,  _svc_bike,   _this_mon + interval '1 day 10 hours',       _this_mon + interval '1 day 10 hours 30 min', 'completed', 3900),
    (_tid, _c7,  _tove,  _svc_ems,    _this_mon + interval '1 day 11 hours',       _this_mon + interval '1 day 11 hours 30 min', 'completed', 8000),
    (_tid, _c8,  _nigel, _svc_combo,  _this_mon + interval '1 day 14 hours',       _this_mon + interval '1 day 14 hours 45 min', 'completed', 3900),
    (_tid, _c9,  _jade,  _svc_laser,  _this_mon + interval '1 day 15 hours 30 min',_this_mon + interval '1 day 16 hours',        'completed', 2500);

  -- Wednesday
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    (_tid, _c10, _tove,  _svc_ems,    _this_mon + interval '2 days 9 hours',       _this_mon + interval '2 days 9 hours 30 min',  'completed', 8000),
    (_tid, _c11, _jade,  _svc_bike,   _this_mon + interval '2 days 10 hours 30 min',_this_mon + interval '2 days 11 hours',       'completed', 3900),
    (_tid, _c12, _nigel, _svc_freeze, _this_mon + interval '2 days 12 hours',      _this_mon + interval '2 days 12 hours 45 min', 'completed', 16000),
    (_tid, _c13, _tove,  _svc_laser,  _this_mon + interval '2 days 14 hours',      _this_mon + interval '2 days 14 hours 30 min', 'completed', 2500),
    (_tid, _c1,  _jade,  _svc_ems,    _this_mon + interval '2 days 16 hours',      _this_mon + interval '2 days 16 hours 30 min', 'completed', 8000);

  -- Thursday
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    (_tid, _c2,  _tove,  _svc_bike,   _this_mon + interval '3 days 9 hours',       _this_mon + interval '3 days 9 hours 30 min',  'completed', 3900),
    (_tid, _c3,  _nigel, _svc_ems,    _this_mon + interval '3 days 10 hours',      _this_mon + interval '3 days 10 hours 30 min', 'completed', 8000),
    (_tid, _c14, _jade,  _svc_laser,  _this_mon + interval '3 days 11 hours',      _this_mon + interval '3 days 11 hours 30 min', 'completed', 4500),
    (_tid, _c15, _tove,  _svc_freeze, _this_mon + interval '3 days 13 hours',      _this_mon + interval '3 days 13 hours 45 min', 'completed', 16000),
    (_tid, _c4,  _jade,  _svc_ems,    _this_mon + interval '3 days 15 hours',      _this_mon + interval '3 days 15 hours 30 min', 'completed', 8000);

  -- Friday (today) — mix of completed (past) + confirmed (future)
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    (_tid, _c5,  _tove,  _svc_ems,    _this_mon + interval '4 days 9 hours',       _this_mon + interval '4 days 9 hours 30 min',  'completed', 8000),
    (_tid, _c6,  _jade,  _svc_bike,   _this_mon + interval '4 days 10 hours',      _this_mon + interval '4 days 10 hours 30 min', 'completed', 3900),
    (_tid, _c7,  _nigel, _svc_laser,  _this_mon + interval '4 days 11 hours',      _this_mon + interval '4 days 11 hours 30 min', 'completed', 2500),
    (_tid, _c8,  _tove,  _svc_bike,   _this_mon + interval '4 days 13 hours',      _this_mon + interval '4 days 13 hours 30 min', 'confirmed', 3900),
    (_tid, _c9,  _jade,  _svc_ems,    _this_mon + interval '4 days 14 hours',      _this_mon + interval '4 days 14 hours 30 min', 'confirmed', 8000),
    (_tid, _c10, _nigel, _svc_freeze, _this_mon + interval '4 days 15 hours',      _this_mon + interval '4 days 15 hours 45 min', 'confirmed', 16000);

  -- ── LAST WEEK bookings (all completed, ~£1 800 total) ───────────────────────
  insert into public.bookings (tenant_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_pence)
  values
    -- Last Monday
    (_tid, _c11, _tove,  _svc_bike,   _last_mon + interval '9 hours',              _last_mon + interval '9 hours 30 min',  'completed', 3900),
    (_tid, _c12, _jade,  _svc_ems,    _last_mon + interval '10 hours',             _last_mon + interval '10 hours 30 min', 'completed', 8000),
    (_tid, _c13, _nigel, _svc_freeze, _last_mon + interval '13 hours',             _last_mon + interval '13 hours 45 min', 'completed', 16000),
    -- Last Tuesday
    (_tid, _c14, _tove,  _svc_laser,  _last_mon + interval '1 day 9 hours',        _last_mon + interval '1 day 9 hours 30 min',  'completed', 2500),
    (_tid, _c15, _jade,  _svc_ems,    _last_mon + interval '1 day 10 hours 30 min',_last_mon + interval '1 day 11 hours',        'completed', 8000),
    (_tid, _c1,  _tove,  _svc_bike,   _last_mon + interval '1 day 14 hours',       _last_mon + interval '1 day 14 hours 30 min', 'completed', 3900),
    -- Last Wednesday
    (_tid, _c2,  _jade,  _svc_ems,    _last_mon + interval '2 days 9 hours',       _last_mon + interval '2 days 9 hours 30 min',  'completed', 8000),
    (_tid, _c3,  _tove,  _svc_bike,   _last_mon + interval '2 days 11 hours',      _last_mon + interval '2 days 11 hours 30 min', 'completed', 3900),
    (_tid, _c4,  _nigel, _svc_laser,  _last_mon + interval '2 days 14 hours',      _last_mon + interval '2 days 14 hours 30 min', 'completed', 4500),
    -- Last Thursday
    (_tid, _c5,  _tove,  _svc_freeze, _last_mon + interval '3 days 10 hours',      _last_mon + interval '3 days 10 hours 45 min', 'completed', 16000),
    (_tid, _c6,  _jade,  _svc_bike,   _last_mon + interval '3 days 13 hours',      _last_mon + interval '3 days 13 hours 30 min', 'completed', 3900),
    -- Last Friday
    (_tid, _c7,  _tove,  _svc_ems,    _last_mon + interval '4 days 9 hours',       _last_mon + interval '4 days 9 hours 30 min',  'completed', 8000),
    (_tid, _c8,  _jade,  _svc_laser,  _last_mon + interval '4 days 10 hours 30 min',_last_mon + interval '4 days 11 hours',       'completed', 2500),
    -- Last Saturday
    (_tid, _c9,  _tove,  _svc_bike,   _last_mon + interval '5 days 9 hours',       _last_mon + interval '5 days 9 hours 30 min',  'completed', 3900),
    (_tid, _c10, _jade,  _svc_ems,    _last_mon + interval '5 days 10 hours',      _last_mon + interval '5 days 10 hours 30 min', 'completed', 8000);

  raise notice 'Seed 04 complete — 15 clients, % this-week bookings, 15 last-week bookings seeded for tenant %',
    (select count(*) from public.bookings
     where tenant_id = _tid
       and starts_at >= _this_mon
       and client_id in (_c1,_c2,_c3,_c4,_c5,_c6,_c7,_c8,_c9,_c10,_c11,_c12,_c13,_c14,_c15)),
    _tid;

end $$;

-- =====================================================
-- Summary of what this seed creates:
--
-- 15 clients — realistic UK female names (common Astrabody clientele)
--              emails all @demo-astrabody.co.uk so easy to spot & delete
--
-- This week (Mon–Fri):
--   Mon  4 bookings  = £303 (£39 + £80 + £25 + £160)
--   Tue  5 bookings  = £163 (£0  + £39 + £80 + £39 + £25)
--   Wed  5 bookings  = £383 (£80 + £39 + £160 + £25 + £80)
--   Thu  5 bookings  = £403 (£39 + £80 + £45 + £160 + £80)
--   Fri  6 bookings  = £424 (£80 + £39 + £25 + £39 + £80 + £160)
--        = ~£1 676 this week total
--
-- Last week:
--   ~£1 010 — gives a ~+66% week-on-week trend on the dashboard
--
-- Dashboard KPIs this produces:
--   Clients      = 15 (active)
--   Today        = 6 bookings (3 completed + 3 confirmed)
--   This week    = ~£1 676
--   Session ring = 3/6 = 50% completed
-- =====================================================
