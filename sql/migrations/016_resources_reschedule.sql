-- =====================================================
-- Astrabody Platform — Migration 016
-- Multi-resource per service + client-side reschedule
-- =====================================================
-- Schema:
--   A. service_resources       — physical units per service (Bike 1, Bike 2)
--   B. bookings.resource_id    — nullable FK to service_resources
--   C. tenants.reschedule_cutoff_hours — hours before start the client
--      can still self-reschedule (default 1, admin overrides anytime)
--   D. Seed Bike 1 + Bike 2 for Astrabody InfraBike service
--   E. Seed `rescheduled_by_client` email template
-- =====================================================

-- A. service_resources --------------------------------

create table if not exists public.service_resources (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  int  not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (service_id, name)
);

create index if not exists service_resources_service_active_idx
  on public.service_resources(service_id, is_active, sort_order);

alter table public.service_resources enable row level security;
drop policy if exists service_resources_tenant_isolation on public.service_resources;
create policy service_resources_tenant_isolation on public.service_resources
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- Portal-client SELECT: clients need to see active resources to pick
-- one in the booking flow.
drop policy if exists service_resources_portal_read on public.service_resources;
create policy service_resources_portal_read on public.service_resources
  for select using (
    is_active = true
    and tenant_id in (select public.current_user_portal_tenant_ids())
  );

-- B. bookings.resource_id -----------------------------

alter table public.bookings
  add column if not exists resource_id uuid
    references public.service_resources(id) on delete set null;

create index if not exists bookings_resource_starts_idx
  on public.bookings(resource_id, starts_at)
  where resource_id is not null;

-- C. tenants.reschedule_cutoff_hours -------------------

alter table public.tenants
  add column if not exists reschedule_cutoff_hours int not null default 1;

-- D. Seed Astrabody InfraBike resources ---------------

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
),
svc as (
  select s.id as service_id, s.tenant_id
  from public.services s, t
  where s.tenant_id = t.tenant_id and s.slug = 'infrabike'
)
insert into public.service_resources
  (tenant_id, service_id, name, description, sort_order, is_active)
select
  svc.tenant_id, svc.service_id, v.name, v.description, v.sort_order, true
from svc, (values
  ('Bike 1', 'Adjustable pedals, best for tall or short clients', 10),
  ('Bike 2', null, 20)
) as v(name, description, sort_order)
on conflict (service_id, name) do nothing;

-- E. Seed rescheduled_by_client email template ---------

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
)
insert into public.email_templates
  (tenant_id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active)
select (select tenant_id from t), v.slug, v.name, v.subject, v.body_md, v.trigger, v.offset_min, true
from (values
  (
    'rescheduled_by_client',
    'Client-initiated reschedule confirmation',
    'Your session has been moved',
    $body$Hi {{client.first_name}},

Quick confirmation that you've moved your {{service.name}} session.

Was: {{old.starts_at_friendly}} at {{old.time}}
Now: {{new.starts_at_friendly}} at {{new.time}}

Same place: 149 Hursley Road, Chandler's Ford. See you then.

{{staff.first_name}}$body$,
    'manual', 0
  )
) as v(slug, name, subject, body_md, trigger, offset_min)
where (select tenant_id from t) is not null
on conflict (tenant_id, slug) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
