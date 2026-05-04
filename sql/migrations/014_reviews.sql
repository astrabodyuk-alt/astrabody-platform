-- =====================================================
-- Astrabody Platform — Migration 014
-- Post-session review-request engine + NPS capture
-- =====================================================
-- The `review_requests` table already exists from 001 (sketched for
-- the WhatsApp-bot review flow but never wired to UI). We extend it
-- here rather than recreate, since 003.loyalty_ledger has an FK to it.
--
-- Schema:
--   A. clients — denormalised review state
--   B. review_requests — add columns + new CHECKs to support the
--      milestone-trigger + NPS + Google review flow.
--   C. tenants — Google Business URL + review bonus % + pause toggle
--      + owner_email used for the internal low-NPS notification
--   D. Seed `review_request` email template for tenant 'astrabody'
--      with a /portal/review/{{review.id}} CTA. Voice rules apply.
-- =====================================================

-- A. clients ------------------------------------------

alter table public.clients
  add column if not exists has_left_google_review boolean not null default false,
  add column if not exists last_review_request_at timestamptz;

-- B. review_requests — extend the existing 001 schema --

-- New columns. All additive; nothing dropped from the legacy schema
-- (channel / sent_at / private_feedback / reward_code stay around but
--  are unused by V1 of this engine).
alter table public.review_requests
  add column if not exists trigger_reason             text,
  add column if not exists nps_comment                text,
  add column if not exists google_review_clicked      boolean default false,
  add column if not exists google_review_confirmed_at timestamptz,
  add column if not exists status                     text default 'sent',
  add column if not exists responded_at               timestamptz;

-- The existing booking_id is NOT NULL + UNIQUE; that's exactly the
-- semantics we want (one review prompt per completed booking) so we
-- keep both.

-- Add CHECK constraints. Idempotent — drop first if present.
alter table public.review_requests
  drop constraint if exists review_requests_trigger_reason_check;
alter table public.review_requests
  add constraint review_requests_trigger_reason_check
  check (
    trigger_reason is null or trigger_reason in (
      'first_session','programme_complete','milestone_5','milestone_10'
    )
  );

alter table public.review_requests
  drop constraint if exists review_requests_status_check;
alter table public.review_requests
  add constraint review_requests_status_check
  check (status in (
    'sent','responded','google_clicked','google_confirmed','dismissed'
  ));

create index if not exists review_requests_client_created_idx
  on public.review_requests(client_id, created_at desc);
create index if not exists review_requests_tenant_status_idx
  on public.review_requests(tenant_id, status, created_at desc);

-- Portal-client SELECT + UPDATE: a client can read + respond to her
-- own review request. INSERT stays service-role only — the action
-- layer (markBookingCompleted) creates the row.
drop policy if exists review_requests_portal_self on public.review_requests;
create policy review_requests_portal_self on public.review_requests
  for select using (client_id in (select public.current_user_client_ids()));

drop policy if exists review_requests_portal_self_update on public.review_requests;
create policy review_requests_portal_self_update on public.review_requests
  for update using (client_id in (select public.current_user_client_ids()))
  with check (client_id in (select public.current_user_client_ids()));

-- C. tenants ------------------------------------------

alter table public.tenants
  add column if not exists google_business_review_url text,
  add column if not exists review_bonus_voucher_pct  int  not null default 15,
  add column if not exists review_requests_paused    boolean not null default false,
  add column if not exists owner_email               text;

-- D. Seed the `review_request` email template --------
-- Idempotent on (tenant_id, slug). Body uses {{review.url}} which the
-- dispatcher fills with NEXT_PUBLIC_APP_URL + /portal/review/<id>.

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
)
insert into public.email_templates
  (tenant_id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active)
select (select tenant_id from t), v.slug, v.name, v.subject, v.body_md, v.trigger, v.offset_min, true
from (values
  (
    'review_request',
    'Post-session review request',
    'How was your Astrabody experience?',
    $body$Hi {{client.first_name}},

A quick one. Whenever you have a moment, would you let us know how the {{service.name}} session went? Two minutes, no frills, and it genuinely shapes how we work.

[Tell us how it went]({{review.url}})

If you loved it, there's a small surprise on the other side. If you didn't, even better, we'd want to hear that too.

{{staff.first_name}}$body$,
    'review_request', 0
  )
) as v(slug, name, subject, body_md, trigger, offset_min)
where (select tenant_id from t) is not null
on conflict (tenant_id, slug) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
