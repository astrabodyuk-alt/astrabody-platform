-- =====================================================
-- Astrabody Platform — Migration 015
-- In-portal shop (digital products)
-- =====================================================
-- Schema:
--   A. products              — catalogue per tenant
--   B. product_purchases     — sale + delivery audit
--   C. product_downloads     — download events for forensics
-- Plus:
--   D. Storage buckets `products-public` (covers / previews) and
--      `products-private` (the actual asset files; signed URLs only).
--   E. Seed Tenant 1 with the Astrabody Nutrition Blueprint at £19.99.
--      Asset paths reference files Nigel uploads via /admin/shop once
--      the page is live; no binary content is shipped in this migration.
-- =====================================================

-- A. products ----------------------------------------------------------

create table if not exists public.products (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  slug                text not null,
  name                text not null,
  short_pitch         text not null,
  long_description_md text,
  cover_url           text,
  price_pence         int  not null check (price_pence >= 0),
  currency            text not null default 'gbp',
  kind                text not null check (kind in ('pdf','video','external_link')),
  asset_url           text,
  preview_url         text,
  member_discount_pct int  default 0 check (member_discount_pct between 0 and 100),
  free_for_tier       text check (free_for_tier in ('insider','studio_insider')),
  is_active           boolean not null default true,
  sort_order          int  not null default 100,
  created_at          timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists products_tenant_active_idx
  on public.products(tenant_id, is_active, sort_order);

alter table public.products enable row level security;
drop policy if exists products_tenant_isolation on public.products;
create policy products_tenant_isolation on public.products
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- Portal-client SELECT: anyone signed in for this tenant can browse
-- the active catalogue.
drop policy if exists products_portal_browse on public.products;
create policy products_portal_browse on public.products
  for select using (
    is_active = true
    and tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- B. product_purchases -------------------------------------------------

create table if not exists public.product_purchases (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  product_id            uuid not null references public.products(id) on delete restrict,
  client_id             uuid references public.clients(id) on delete set null,
  buyer_email           text not null,
  amount_pence          int  not null check (amount_pence >= 0),
  stripe_payment_intent text,
  status                text not null default 'pending'
                        check (status in ('pending','paid','refunded')),
  delivery_url          text,
  delivered_at          timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists product_purchases_tenant_created_idx
  on public.product_purchases(tenant_id, created_at desc);
create index if not exists product_purchases_client_idx
  on public.product_purchases(client_id, created_at desc);
create unique index if not exists product_purchases_intent_idx
  on public.product_purchases(stripe_payment_intent)
  where stripe_payment_intent is not null;

alter table public.product_purchases enable row level security;
drop policy if exists product_purchases_tenant_isolation on public.product_purchases;
create policy product_purchases_tenant_isolation on public.product_purchases
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- Portal-client SELECT: a client can read her own purchases (used by
-- the order page). INSERT / UPDATE stay service-role only — server
-- actions create rows and flip statuses.
drop policy if exists product_purchases_portal_self on public.product_purchases;
create policy product_purchases_portal_self on public.product_purchases
  for select using (
    client_id in (select public.current_user_client_ids())
  );

-- C. product_downloads -------------------------------------------------

create table if not exists public.product_downloads (
  id              uuid primary key default uuid_generate_v4(),
  purchase_id     uuid not null references public.product_purchases(id) on delete cascade,
  client_ip       text,
  downloaded_at   timestamptz not null default now()
);

create index if not exists product_downloads_purchase_idx
  on public.product_downloads(purchase_id, downloaded_at desc);

alter table public.product_downloads enable row level security;
-- No policy needed: only service-role inserts (action layer); reads
-- happen through joins on product_purchases or admin-side queries with
-- the user-scoped client (which has tenant access via the parent join).
drop policy if exists product_downloads_tenant_read on public.product_downloads;
create policy product_downloads_tenant_read on public.product_downloads
  for select using (
    purchase_id in (
      select id from public.product_purchases
      where tenant_id in (select public.current_user_tenant_ids())
    )
  );

-- D. Storage buckets ---------------------------------------------------
-- public bucket → covers + previews are world-readable
-- private bucket → signed URLs only; no public read

insert into storage.buckets (id, name, public)
values ('products-public', 'products-public', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('products-private', 'products-private', false)
on conflict (id) do nothing;

-- Storage RLS: the service-role client (admin upload + signed-URL
-- generation) bypasses RLS, so we don't need to grant authenticated
-- users any direct object access.
-- The public bucket exposes objects via the standard public URL
-- pattern, no further policy required.

-- E. Seed Astrabody Nutrition Blueprint --------------------------------
-- Idempotent on (tenant_id, slug). The asset file isn't shipped here;
-- Nigel uploads it once via /admin/shop. cover_url + asset_url point at
-- the eventual paths so the order page can render before upload.

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
)
insert into public.products
  (tenant_id, slug, name, short_pitch, long_description_md, cover_url,
   price_pence, currency, kind, asset_url, preview_url,
   member_discount_pct, free_for_tier, is_active, sort_order)
select
  (select tenant_id from t),
  'nutrition-blueprint',
  'Astrabody Nutrition Blueprint',
  'The 42-day eating protocol behind our Summer Sculpt cohort. 23 pages.',
  $body$The Nutrition Blueprint is the same protocol we use with our Summer Sculpt cohort, written down in plain language. Six weeks, three meal templates, one shopping list.

You'll find:

* **Why** the protocol works (energy, sleep, body composition), in two paragraphs not twenty.
* **What** to eat each week, mapped to British supermarkets.
* **When** to eat it, with simple anchors around your training (or no training).
* **Swaps** for vegetarian, dairy-free, and budget weeks.
* The **shopping list** ready to screenshot.

It's not magic. It's the boring, repeatable thing that produces the result.

23 pages, PDF, instantly downloadable. Yours for life.$body$,
  null,
  1999,
  'gbp',
  'pdf',
  'astrabody/nutrition-blueprint-cohort.pdf',
  null,
  50,
  'studio_insider',
  true,
  10
where (select tenant_id from t) is not null
on conflict (tenant_id, slug) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
