-- =====================================================
-- Astrabody Platform — Migration 024
-- Per-service intake / consultation forms
-- =====================================================
-- Admin defines a form template tied to one or more services. When a
-- booking is created against an attached service the platform mints an
-- intake_responses row carrying a secure 32-char token, sent to the
-- client 24h ahead via WhatsApp + email. The client fills it in on a
-- public /intake/<token> page; the admin sees the answers (and any
-- signature) inside the booking detail drawer.
-- =====================================================

-- -----------------------------------------------------
-- INTAKE_FORMS — admin-defined templates
-- -----------------------------------------------------
create table if not exists public.intake_forms (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  service_ids uuid[] not null default '{}'::uuid[],
  fields      jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_by_user_id uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists intake_forms_tenant_active_idx
  on public.intake_forms(tenant_id, is_active);

-- GIN index over service_ids[] so the booking hook can look up the
-- matching form for a service in O(log n) regardless of how many
-- forms exist.
create index if not exists intake_forms_service_ids_gin
  on public.intake_forms using gin (service_ids);

alter table public.intake_forms enable row level security;

drop policy if exists intake_forms_admin_select on public.intake_forms;
create policy intake_forms_admin_select on public.intake_forms
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

drop policy if exists intake_forms_admin_write on public.intake_forms;
create policy intake_forms_admin_write on public.intake_forms
  for all using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  ) with check (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- -----------------------------------------------------
-- INTAKE_RESPONSES — one row per booking
-- -----------------------------------------------------
create table if not exists public.intake_responses (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  booking_id    uuid not null unique references public.bookings(id) on delete cascade,
  form_id       uuid not null references public.intake_forms(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz,
  token         text not null unique,
  reminder_sent_at timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists intake_responses_tenant_recent_idx
  on public.intake_responses(tenant_id, created_at desc);

create index if not exists intake_responses_pending_idx
  on public.intake_responses(tenant_id, expires_at)
  where submitted_at is null;

create index if not exists intake_responses_client_idx
  on public.intake_responses(client_id, created_at desc);

alter table public.intake_responses enable row level security;

-- Owner / admin: full visibility for their tenant.
drop policy if exists intake_responses_admin_select on public.intake_responses;
create policy intake_responses_admin_select on public.intake_responses
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- Client (signed in via portal): see their own responses.
drop policy if exists intake_responses_client_select on public.intake_responses;
create policy intake_responses_client_select on public.intake_responses
  for select using (
    client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
  );

-- INSERT / UPDATE: service-role only. The /api/intake/<token>/submit
-- route uses the admin client to update answers + submitted_at. This
-- avoids exposing the token table to anon RLS.

-- =====================================================
-- DONE.
-- =====================================================
