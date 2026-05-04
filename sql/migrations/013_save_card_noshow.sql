-- =====================================================
-- Astrabody Platform — Migration 013
-- Save-card on file + no-show / late-cancel charging
-- =====================================================
-- Three sets of changes:
--   A. clients — Stripe customer + denormalised default-card metadata.
--   B. client_payment_methods — full ledger (multiple cards possible
--      future, today we mark exactly one as default).
--   C. tenants — cancellation-policy knobs.
--   D. bookings — no-show charge audit.
-- Plus the email_templates trigger enum gets two new values
-- (`noshow_charged`, `late_cancel_charged`) and we seed those + a
-- card-on-file-aware version of the 24h reminder.
-- =====================================================

-- A. clients ------------------------------------------

alter table public.clients
  add column if not exists stripe_customer_id text,
  add column if not exists default_payment_method_id text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_exp_month int,
  add column if not exists card_exp_year int,
  add column if not exists saved_card_at timestamptz;

create unique index if not exists clients_stripe_customer_idx
  on public.clients(stripe_customer_id)
  where stripe_customer_id is not null;

-- B. client_payment_methods ---------------------------

create table if not exists public.client_payment_methods (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  client_id                uuid not null references public.clients(id) on delete cascade,
  stripe_payment_method_id text not null,
  brand                    text,
  last4                    text,
  exp_month                int,
  exp_year                 int,
  is_default               boolean not null default false,
  created_at               timestamptz not null default now(),
  unique (client_id, stripe_payment_method_id)
);

create index if not exists client_payment_methods_default_idx
  on public.client_payment_methods(client_id, is_default)
  where is_default = true;

alter table public.client_payment_methods enable row level security;
drop policy if exists client_payment_methods_tenant_isolation on public.client_payment_methods;
create policy client_payment_methods_tenant_isolation on public.client_payment_methods
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- Portal-client SELECT: a client can read her own card rows so the
-- /portal/account page can render "•• 4242 expires 12/27". No INSERT
-- / UPDATE / DELETE — those go through service-role server actions.
drop policy if exists client_payment_methods_portal_read on public.client_payment_methods;
create policy client_payment_methods_portal_read on public.client_payment_methods
  for select using (client_id in (select public.current_user_client_ids()));

-- C. tenants — cancellation policy ---------------------

alter table public.tenants
  add column if not exists cancellation_policy_enabled boolean not null default true,
  add column if not exists noshow_charge_pct           int     not null default 100,
  add column if not exists late_cancel_charge_pct      int     not null default 50,
  add column if not exists late_cancel_cutoff_hours    int     not null default 24,
  add column if not exists cancellation_policy_text    text;

-- D. bookings — no-show charge audit -------------------

alter table public.bookings
  add column if not exists noshow_charged_amount_pence int,
  add column if not exists noshow_charged_at           timestamptz,
  add column if not exists noshow_payment_intent_id    text,
  add column if not exists card_on_file_consent        boolean not null default false;

-- E. email_templates trigger enum + new templates -----
-- Drop the old check, replace with one that includes the new triggers.

alter table public.email_templates
  drop constraint if exists email_templates_trigger_check;

alter table public.email_templates
  add constraint email_templates_trigger_check
  check (trigger in (
    'manual','signup','booking_confirmed','booking_reminder_24h',
    'session_after_care','reengagement_60d','birthday','tier_unlock',
    'review_request','referral_invite',
    'noshow_charged','late_cancel_charged'
  ));

-- Seed two new templates + a card-on-file-aware reminder variant.
-- All three are idempotent on (tenant_id, slug).

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
)
insert into public.email_templates
  (tenant_id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active)
select (select tenant_id from t), v.slug, v.name, v.subject, v.body_md, v.trigger, v.offset_min, true
from (values
  (
    'noshow_charged',
    'No-show charge confirmation',
    'About today',
    $body$Hi {{client.first_name}},

We were ready for your {{service.name}} at {{booking.time}} today, and we're sorry we missed you.

Per our cancellation policy, we've charged £{{charge.amount}} to your card ending {{card.last4}}. The full policy is at the bottom of this email.

If something serious came up, just reply here and I'll have a look.

{{staff.first_name}}$body$,
    'noshow_charged', 0
  ),
  (
    'late_cancel_charged',
    'Late cancellation charge',
    'Your cancellation, and the policy',
    $body$Hi {{client.first_name}},

Thanks for letting us know you can't make {{service.name}} on {{booking.starts_at_friendly}}.

Because that's inside our {{policy.cutoff_hours}}-hour window, we've had to charge £{{charge.amount}} to your card ending {{card.last4}} (that's {{policy.late_cancel_pct}}% of the session price).

Once we've taken on a slot we usually can't fill it that close to the day, which is why the policy exists. Hope to see you soon.

{{staff.first_name}}$body$,
    'late_cancel_charged', 0
  ),
  (
    'booking_reminder_24h_with_policy',
    '24h reminder (card on file)',
    'See you tomorrow at {{booking.time}}',
    $body$Hi {{client.first_name}},

Quick reminder: your {{service.name}} session is tomorrow at {{booking.time}} with {{staff.first_name}}.

A couple of things that help on the day:
* Hydrate well from this evening. Treatments work better with water on board.
* Wear something comfortable. We've got robes if you'd rather change here.

Just so you know, if you can't make it please cancel before {{policy.cutoff_time_friendly}}. Inside that window we'll need to charge {{policy.late_cancel_pct}}% of the session per our cancellation policy. If anything's changed, reply and we'll sort it.

See you tomorrow,
{{staff.first_name}}$body$,
    'booking_reminder_24h', -1440
  )
) as v(slug, name, subject, body_md, trigger, offset_min)
where (select tenant_id from t) is not null
on conflict (tenant_id, slug) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
