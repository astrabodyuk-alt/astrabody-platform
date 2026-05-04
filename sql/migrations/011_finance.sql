-- =====================================================
-- Astrabody Platform — Migration 011
-- Finance: VAT settings + AI coach recommendation cache
-- =====================================================
-- Schema bits the /admin/finance page needs:
--   A. tenants.vat_registered + vat_rate_pct + vat_number — UK VAT
--      treatment is standard-rated 20% above the £90k threshold.
--      Below that threshold we don't charge VAT (vat_registered=false).
--      bookings.price_pence stays the price the client pays (TTC); the
--      ex-VAT split is computed at read time.
--   B. tenants_coach_recommendations — per-(tenant, month) cache for
--      the AI advisor card. Keys on month_iso (YYYY-MM) so each month
--      gets its own row; refreshing within the month overwrites.
-- =====================================================

-- A. tenants VAT columns -------------------------------

alter table public.tenants
  add column if not exists vat_registered boolean not null default false,
  add column if not exists vat_rate_pct  numeric(5,2) not null default 20.00,
  add column if not exists vat_number    text;

-- B. tenants_coach_recommendations ----------------------

create table if not exists public.tenants_coach_recommendations (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  month_iso     text not null,                             -- 'YYYY-MM'
  recommendations jsonb not null,                          -- array of { title, body, icon, cta?, cta_href? }
  generated_at  timestamptz not null default now(),
  generated_by  uuid references auth.users(id),
  unique (tenant_id, month_iso)
);

create index if not exists tenants_coach_rec_tenant_month_idx
  on public.tenants_coach_recommendations(tenant_id, month_iso desc);

alter table public.tenants_coach_recommendations enable row level security;
drop policy if exists tenants_coach_rec_isolation on public.tenants_coach_recommendations;
create policy tenants_coach_rec_isolation on public.tenants_coach_recommendations
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- =====================================================
-- DONE.
-- =====================================================
