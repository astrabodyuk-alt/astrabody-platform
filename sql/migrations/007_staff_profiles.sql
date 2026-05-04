-- =====================================================
-- Astrabody Platform — Migration 007
-- Staff profiles: photo / bio / specialties + Storage bucket
-- =====================================================
-- Three changes:
--   A. Three new columns on public.staff (photo_url, bio_short, specialties).
--   B. Public storage bucket "staff-photos" with size + mime restrictions
--      and RLS policies (public read, tenant_member write).
--   C. Idempotent default profile data for the seeded Astrabody staff
--      (Tove, Jade, Nigel) — only fills the columns when null/empty so
--      we never clobber a real edit.
-- =====================================================

-- A. Schema additions ---------------------------------

alter table public.staff
  add column if not exists photo_url text,
  add column if not exists bio_short text,
  add column if not exists specialties text[];

create index if not exists idx_staff_specialties_gin
  on public.staff using gin (specialties);

-- B. Storage bucket ----------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-photos',
  'staff-photos',
  true,
  5242880,                                   -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read so the booking page can render <img src="…">.
drop policy if exists "staff-photos public read" on storage.objects;
create policy "staff-photos public read" on storage.objects
  for select
  using (bucket_id = 'staff-photos');

-- Authenticated write — gated to anyone who is a tenant_member with
-- role IN ('owner','admin','staff'). The application layer further
-- restricts which staff_id a given user may upload for (self-only
-- unless owner/admin).
drop policy if exists "staff-photos write" on storage.objects;
create policy "staff-photos write" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from public.tenant_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'staff')
    )
  )
  with check (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from public.tenant_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'staff')
    )
  );

-- C. Default profiles --------------------------------

do $$
declare
  _tid uuid;
begin
  select id into _tid from public.tenants where slug = 'astrabody' limit 1;
  if _tid is null then return; end if;

  -- Tove
  update public.staff set
    bio_short = coalesce(bio_short,
      'Tove specialises in body sculpting and fat freezing. She''s been with Astrabody since opening.'),
    specialties = case
      when specialties is null or array_length(specialties, 1) is null
        then array['Fat Freezing', 'EMS']
      else specialties
    end
  where tenant_id = _tid and display_name = 'Tove';

  -- Jade
  update public.staff set
    bio_short = coalesce(bio_short,
      'Jade leads our laser hair removal protocols and InfraBike programmes.'),
    specialties = case
      when specialties is null or array_length(specialties, 1) is null
        then array['Laser', 'InfraBike']
      else specialties
    end
  where tenant_id = _tid and display_name = 'Jade';

  -- Nigel
  update public.staff set
    bio_short = coalesce(bio_short,
      'Nigel is the founder of Astrabody. He oversees treatments and member care.'),
    specialties = case
      when specialties is null or array_length(specialties, 1) is null
        then array['InfraBike', 'EMS', 'Fat Freezing']
      else specialties
    end
  where tenant_id = _tid and display_name = 'Nigel';
end $$;

-- =====================================================
-- DONE.
-- =====================================================
