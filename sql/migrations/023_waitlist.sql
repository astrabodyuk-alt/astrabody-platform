-- =====================================================
-- Astrabody Platform — Migration 023
-- Client waitlist for full slots
-- =====================================================
-- Clients can join a waitlist for a specific service + date when no
-- slots are available. When a slot opens (booking cancelled, staff
-- time-off removed, studio closure removed) the platform fires an
-- async notify hook that pings the first eligible entry on WhatsApp.
-- =====================================================

create table if not exists public.waitlist_entries (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  service_id        uuid not null references public.services(id) on delete cascade,
  staff_id          uuid references public.staff(id) on delete set null,
  preferred_date    date not null,
  preferred_window  text not null default 'any'
                      check (preferred_window in ('morning','afternoon','evening','any')),
  notified_at       timestamptz,
  expires_at        timestamptz not null default (now() + interval '30 days'),
  created_at        timestamptz not null default now()
);

create index if not exists waitlist_entries_match_idx
  on public.waitlist_entries(tenant_id, service_id, preferred_date);

create index if not exists waitlist_entries_client_idx
  on public.waitlist_entries(client_id, created_at desc);

-- Pending = not yet notified, not expired. Cheap partial index for the
-- notify cron / fan-out helper.
create index if not exists waitlist_entries_pending_idx
  on public.waitlist_entries(tenant_id, service_id, preferred_date, created_at)
  where notified_at is null and expires_at > now();

alter table public.waitlist_entries enable row level security;

-- Client: see own rows.
drop policy if exists waitlist_client_select on public.waitlist_entries;
create policy waitlist_client_select on public.waitlist_entries
  for select using (
    client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
  );

-- Owner / admin: see all for tenant.
drop policy if exists waitlist_admin_select on public.waitlist_entries;
create policy waitlist_admin_select on public.waitlist_entries
  for select using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- Client: insert their own row. The action validates client_id matches
-- the portal link, but the policy enforces it at the row level too.
drop policy if exists waitlist_client_insert on public.waitlist_entries;
create policy waitlist_client_insert on public.waitlist_entries
  for insert with check (
    client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
    and tenant_id in (select public.current_user_tenant_ids())
  );

-- Client: delete own row.
drop policy if exists waitlist_client_delete on public.waitlist_entries;
create policy waitlist_client_delete on public.waitlist_entries
  for delete using (
    client_id in (
      select cpl.client_id from public.client_portal_links cpl
      where cpl.user_id = auth.uid()
    )
  );

-- Owner / admin: delete any tenant row.
drop policy if exists waitlist_admin_delete on public.waitlist_entries;
create policy waitlist_admin_delete on public.waitlist_entries
  for delete using (
    tenant_id in (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = auth.uid() and tm.role in ('owner','admin')
    )
  );

-- UPDATE (notified_at) is service-role only — set by the notify hook
-- via the admin client.

-- =====================================================
-- DONE.
-- =====================================================
