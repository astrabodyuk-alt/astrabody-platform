-- =====================================================
-- Astrabody Platform — Migration 012
-- Email templates, sends ledger, broadcasts (Resend)
-- =====================================================
-- Three tables for email:
--   A. email_templates     — per-tenant, per-trigger; editable.
--   B. email_sends         — every individual send (resend_id, status).
--   C. email_broadcasts    — manual marketing campaigns to a segment.
-- Plus a starter seed of 10 templates for tenant 'astrabody', UK
-- English, no em-dashes, no marketing-speak. Copy is editable in
-- /admin/emails — these are just sensible defaults.
-- =====================================================

-- A. email_templates -----------------------------------

create table if not exists public.email_templates (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  slug         text not null,
  name         text not null,
  subject      text not null,
  body_md      text not null,
  trigger      text not null check (trigger in (
                 'manual','signup','booking_confirmed','booking_reminder_24h',
                 'session_after_care','reengagement_60d','birthday','tier_unlock',
                 'review_request','referral_invite'
               )),
  trigger_offset_minutes int default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists email_templates_tenant_trigger_idx
  on public.email_templates(tenant_id, trigger, is_active);

alter table public.email_templates enable row level security;
drop policy if exists email_templates_isolation on public.email_templates;
create policy email_templates_isolation on public.email_templates
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- updated_at touch trigger so the editor can show "saved a moment ago".
create or replace function public.touch_email_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_email_templates_touch on public.email_templates;
create trigger trg_email_templates_touch
  before update on public.email_templates
  for each row execute function public.touch_email_templates_updated_at();

-- B. email_sends ---------------------------------------

create table if not exists public.email_sends (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  template_id  uuid references public.email_templates(id) on delete set null,
  client_id    uuid references public.clients(id) on delete set null,
  to_email     text not null,
  subject      text not null,
  body_html    text not null,
  resend_id    text unique,
  status       text not null default 'queued'
               check (status in ('queued','sent','delivered','bounced','failed')),
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists email_sends_client_idx
  on public.email_sends(client_id, created_at desc);
create index if not exists email_sends_tenant_status_idx
  on public.email_sends(tenant_id, status, created_at desc);
create index if not exists email_sends_template_idx
  on public.email_sends(template_id, created_at desc);

alter table public.email_sends enable row level security;
drop policy if exists email_sends_isolation on public.email_sends;
create policy email_sends_isolation on public.email_sends
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- C. email_broadcasts ----------------------------------

create table if not exists public.email_broadcasts (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  subject         text not null,
  body_md         text not null,
  segment_query   jsonb not null,
  scheduled_at    timestamptz,
  sent_count      int default 0,
  status          text not null default 'draft'
                  check (status in ('draft','scheduled','sending','sent','failed')),
  created_by_user_id uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists email_broadcasts_tenant_status_idx
  on public.email_broadcasts(tenant_id, status, created_at desc);

alter table public.email_broadcasts enable row level security;
drop policy if exists email_broadcasts_isolation on public.email_broadcasts;
create policy email_broadcasts_isolation on public.email_broadcasts
  for all using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));

-- D. Seed starter templates for tenant 'astrabody' -----
-- Idempotent on (tenant_id, slug). Bodies use {{handlebars}} that
-- render() in src/lib/email/render.ts will substitute. Voice rules:
--   - UK English, contractions OK
--   - no em-dashes
--   - no marketing-speak, no ALL CAPS
--   - one ✨ or 🌿 max per template
-- Copy is editable per tenant in /admin/emails — these are defaults
-- to get a brand-new tenant up and running.

with t as (
  select id as tenant_id from public.tenants where slug = 'astrabody'
)
insert into public.email_templates
  (tenant_id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active)
select (select tenant_id from t), v.slug, v.name, v.subject, v.body_md, v.trigger, v.offset_min, true
from (values
  (
    'welcome',
    'Welcome — first sign-in',
    'Welcome to {{tenant.name}} ✨',
    $body$Hi {{client.first_name}},

So glad you're with us. {{tenant.name}} is a small private studio in Chandler''s Ford and we keep it that way on purpose: appointments only, never rushed, the whole hour is yours.

If you ever want a recommendation for your goals, or you''re not sure where to start, just reply to this email. Real human, not a bot.

Speak soon,
The Astrabody team$body$,
    'signup', 0
  ),
  (
    'booking_confirmed',
    'Booking confirmed',
    'Your {{service.name}} session is confirmed',
    $body$Hi {{client.first_name}},

You''re booked in for {{service.name}} on {{booking.starts_at_friendly}} at {{booking.time}} with {{staff.first_name}}.

We''re at 149 Hursley Road, Chandler''s Ford. Easy parking out front. Come a few minutes early so you can settle in.

If you need to move things around, reply here or use your portal. We''ll see you on the day.

The Astrabody team$body$,
    'booking_confirmed', 0
  ),
  (
    'booking_reminder_24h',
    '24h reminder',
    'See you tomorrow at {{booking.time}}',
    $body$Hi {{client.first_name}},

Quick reminder: your {{service.name}} session is tomorrow at {{booking.time}} with {{staff.first_name}}.

A couple of things that help on the day:
* Hydrate well from this evening. Treatments work better with water on board.
* Wear something comfortable. We''ve got robes if you''d rather change here.
* If anything''s changed, reply and we''ll sort it.

See you tomorrow,
{{staff.first_name}}$body$,
    'booking_reminder_24h', -1440
  ),
  (
    'after_care_infrabike',
    'After-care — InfraBike',
    'After your InfraBike session: small things that matter',
    $body$Hi {{client.first_name}},

Hope you enjoyed today''s ride. Quick after-care so you get the most out of it.

For the next 24 hours, drink more water than you think you need. Infrared keeps working under the skin for a few hours after the session, so cool showers (not hot) help your body settle. A light protein meal in the next hour locks in the metabolic boost.

If you booked the trial and you''d like to know what we''d recommend next based on your goals, just reply. No hard sell, ever.

{{staff.first_name}}$body$,
    'session_after_care', 120
  ),
  (
    'after_care_ems',
    'After-care — EMS SupraSculpt',
    'Your post-EMS recovery',
    $body$Hi {{client.first_name}},

Today''s SupraSculpt session put your muscles through about 20 000 contractions. Mild soreness in the next 24 to 48 hours is normal and means it worked.

A few things that help: protein within the next hour, plenty of water, and gentle movement (a walk, light stretching). Skip the gym tonight and go easy on caffeine.

The visible work happens between sessions, not in them. If you''d like the recommended cadence for your goals, reply here.

{{staff.first_name}}$body$,
    'session_after_care', 120
  ),
  (
    'after_care_fat_freezing',
    'After-care — Fat Freezing',
    'What to expect over the next 8 weeks',
    $body$Hi {{client.first_name}},

Cryolipolysis is a slow burn (the good kind). Most of the visible change shows up between weeks 4 and 8, with peak result around week 12.

For the next few days you may notice: redness, light bruising, a tingling sensation, or numbness in the treated area. All normal. Massage the area gently for 5 minutes twice a day for the first week — it helps the fat cells break down faster.

We''d wait at least 8 weeks before treating the same area again. If you have questions before then, reply here.

{{staff.first_name}}$body$,
    'session_after_care', 120
  ),
  (
    'after_care_laser',
    'After-care — Laser hair removal',
    'Caring for your skin after laser',
    $body$Hi {{client.first_name}},

For the next 48 hours, treat the area like it''s a little sunburnt: SPF 50 outdoors, no hot showers or saunas, no scrubs or actives. Aloe vera or a fragrance-free moisturiser is perfect.

Hair will start shedding over the next 1 to 3 weeks. That''s the laser working, not new growth.

We''ll book your next session 4 weeks out for the best result. Reply here if you''d like me to slot it in now.

{{staff.first_name}}$body$,
    'session_after_care', 120
  ),
  (
    'reengagement_60d',
    'Re-engagement (60 days inactive)',
    'We''ve been thinking about you',
    $body$Hi {{client.first_name}},

It''s been a couple of months. No pressure either way, just wanted to check in.

If life''s busy and you''d like to slip back in, here''s 10% off your next session as a thank-you for trusting us in the first place. Use the code BACK10 at checkout. It''s good for 30 days.

If you''d rather not hear from me for a while, reply with "pause" and I''ll quiet things down for 60 days.

{{staff.first_name}}$body$,
    'reengagement_60d', 0
  ),
  (
    'birthday',
    'Birthday voucher',
    'Happy birthday from {{tenant.name}} 🌿',
    $body$Hi {{client.first_name}},

Happy birthday. Hope you''re being properly looked after today.

A small gift from us: a free InfraBike session, on the house, valid through the next 60 days. Use the code BIRTHDAY when you book. No catch.

Enjoy the day,
The Astrabody team$body$,
    'birthday', 0
  ),
  (
    'tier_unlock',
    'Loyalty tier unlocked',
    'You''re now an {{tier}} member',
    $body$Hi {{client.first_name}},

You''ve just crossed into our {{tier}} tier, which is genuinely a milestone. Thank you.

What that unlocks: priority booking, a small surprise on your next visit, and a higher points-back rate from now on.

The full list of perks lives in your portal. See you soon.

The Astrabody team$body$,
    'tier_unlock', 0
  )
) as v(slug, name, subject, body_md, trigger, offset_min)
where (select tenant_id from t) is not null
on conflict (tenant_id, slug) do nothing;

-- =====================================================
-- DONE.
-- =====================================================
