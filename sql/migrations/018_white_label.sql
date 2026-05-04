-- =====================================================
-- Astrabody Platform — Migration 018
-- White-label tenants: brand, subdomain, onboarding
-- =====================================================
-- Schema additions to tenants:
--   - generated slug_unique for case-insensitive lookups
--   - brand_logo_url + 5 hex colours + 2 fonts
--   - subdomain + custom_domain
--   - onboarding_completed_at
-- All additive; existing rows keep their values via column defaults.
--
-- Plus a public storage bucket `tenant-logos` (max 2 MB, image/* only —
-- enforced in the upload action layer).
-- =====================================================

alter table public.tenants
  add column if not exists slug_unique text generated always as (lower(slug)) stored,
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_hex text default '#5C6B4E',
  add column if not exists brand_secondary_hex text default '#BBC4AA',
  add column if not exists brand_background_hex text default '#F6F3EE',
  add column if not exists brand_text_hex text default '#3E3E31',
  add column if not exists brand_accent_hex text default '#758564',
  add column if not exists brand_font_heading text default 'Cormorant Garamond',
  add column if not exists brand_font_body text default 'Inter',
  add column if not exists subdomain text,
  add column if not exists onboarding_completed_at timestamptz;

-- Migration 001 already declared `tenants.timezone` and
-- `tenants.custom_domain`, so we don't redeclare them here.

-- Case-insensitive uniqueness on subdomain so two tenants can't claim
-- the same `<sub>.atavoplatform.com`. NULL allowed (tenants without a
-- custom subdomain fall back to slug).
create unique index if not exists tenants_subdomain_unique
  on public.tenants(lower(subdomain))
  where subdomain is not null;

-- Storage bucket for logos.
insert into storage.buckets (id, name, public)
values ('tenant-logos', 'tenant-logos', true)
on conflict (id) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
