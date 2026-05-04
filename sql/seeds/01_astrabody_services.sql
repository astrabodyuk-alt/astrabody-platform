-- =====================================================
-- Astrabody Platform — Seed 01
-- Service catalogue for the Astrabody tenant
-- =====================================================
-- Prices come from /Astrabody/CLAUDE.md (single source of truth).
-- Money in pence (integer). Idempotent via on conflict (tenant_id, slug).
--
-- Categories used here:
--   trial    -- the free InfraBike lead magnet + the trial-day combo
--   session  -- single-session bookable services
--   package  -- multi-session SKUs sold at the till; not slotted directly
--
-- is_bookable is false for packages (they're products, not slots).
-- A booking against a pack happens by creating a single-session
-- booking and crediting it against the pack's purchase elsewhere.
-- =====================================================

do $$
declare
  _tid uuid;
begin
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then
    raise exception 'astrabody tenant not found, run migration 001 first';
  end if;

  insert into public.services
    (tenant_id, slug, name, description,
     duration_min, buffer_min, price_pence, deposit_pence,
     category, is_bookable, min_gap_days, sort_order)
  values
    -- ===== Trials (lead magnet + trial-day combo) =====
    (_tid, 'infrabike-trial',
     'InfraBike trial',
     '30 minutes in the infrared pod, on us. First-time visit only.',
     30, 0,     0, 0, 'trial',   true,   0, 10),

    (_tid, 'trial-combo',
     'InfraBike and EMS trial',
     'Both technologies in one session. 30 minutes InfraBike, then a sample of EMS SupraSculpt.',
     45, 0,  3900, 0, 'trial',   true,   0, 20),

    -- ===== Single sessions =====
    (_tid, 'infrabike',
     'InfraBike',
     'A single 30-minute infrared cycling session.',
     30, 0,  3900, 0, 'session', true,   0, 30),

    (_tid, 'ems-suprasculpt',
     'EMS SupraSculpt',
     '30 minutes of electromagnetic muscle stimulation with localised fat support.',
     30, 0,  8000, 0, 'session', true,   0, 40),

    (_tid, 'fat-freezing-zone',
     'Fat Freezing, single zone',
     'M3Pro 360 cryolipolysis on one zone. FDA cleared. Eight weeks minimum between sessions on the same zone.',
     45, 0, 16000, 0, 'session', true,  56, 50),

    (_tid, 'laser-hair-removal',
     'Laser hair removal',
     'Diode 4-in-1 (755, 808, 940 and 1064 nm). Suitable for all Fitzpatrick I to VI skin types. Four weeks minimum between same-zone sessions. Price shown is the from price; full price depends on the zone.',
     30, 0,   900, 0, 'session', true,  28, 60),

    -- ===== Permanent packages (sold at the till, not slotted) =====
    (_tid, 'pack-infrabike-4',
     'Pack of 4 InfraBike sessions',
     'Four 30-minute InfraBike sessions, used at your pace.',
     30, 0, 11900, 0, 'package', false,  0, 70),

    (_tid, 'pack-infrabike-10',
     'Pack of 10 InfraBike sessions',
     'Ten 30-minute InfraBike sessions, used at your pace.',
     30, 0, 23900, 0, 'package', false,  0, 80),

    (_tid, 'pack-ems-8',
     'Pack of 8 EMS SupraSculpt sessions',
     'Eight EMS sessions for sustained muscle and fat work.',
     30, 0, 51900, 0, 'package', false,  0, 90),

    (_tid, 'pack-fat-freezing-3x3',
     'Fat Freezing pack (3 sessions, up to 3 zones each)',
     'Three Fat Freezing sessions, with up to three zones treated per session. Up to nine zone-treatments in total.',
     45, 0, 69900, 0, 'package', false, 56, 100),

    -- ===== Trial-day-only upsells =====
    (_tid, 'pack-infrabike-10-trial-upsell',
     'Pack of 10 InfraBike (trial-day price)',
     'Ten InfraBike sessions at the trial-day price. Available only on the day of your trial visit.',
     30, 0, 19900, 0, 'package', false,  0, 110),

    (_tid, 'combo-6-infrabike-6-ems-trial-upsell',
     'Combo of 6 InfraBike and 6 EMS (trial-day price)',
     'Six InfraBike sessions plus six EMS sessions at the trial-day price. Available only on the day of your trial visit.',
     45, 0, 44900, 0, 'package', false,  0, 120)
  on conflict (tenant_id, slug) do nothing;
end $$;

-- =====================================================
-- DONE.
-- 12 services seeded for tenant_id where slug = 'astrabody':
--   2 trials, 4 single sessions, 4 permanent packs, 2 trial-day upsells.
-- =====================================================
