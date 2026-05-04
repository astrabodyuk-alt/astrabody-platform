# Astrabody Platform

> Multi-tenant SaaS booking + retention platform.
> Tenant 1 = Astrabody. Built to be resold to other small businesses
> (salons, clinics, restaurants, independent practitioners).

## Why this exists

Most small businesses pay £300+/month across 5 disconnected tools:
booking (Fresha), email (Mailchimp), reviews (Trustmary), WhatsApp
(Sirena) and voice automation. This platform replaces the stack with
one tool at £49–£199/month — and adds a Google Reviews booster that
multiplies a business's review velocity by ~5×.

Astrabody itself runs on tenant #1 from day one. Every feature is
validated on real Astrabody clients before we open it up to paying
tenants from V2/V3.

## Tech stack

| Layer            | Choice                                   | Why                                                       |
|------------------|------------------------------------------|-----------------------------------------------------------|
| Frontend         | Next.js 15 (App Router) + Tailwind + shadcn/ui | Same stack as the existing Astrabody trial-funnel app. |
| Backend          | Supabase (Postgres + Auth + RLS + Edge Functions + Storage + Realtime) | Already in production for the WhatsApp bot. |
| Calendar         | Google Calendar API v3 + OAuth2          | Native on iPhone/Mac/Outlook. No separate app to install. |
| Payments         | Stripe (sessions, subscriptions, deposits) | Standard, well-supported.                              |
| In-studio terminal | MyPOS                                  | Used at the studio till for in-person payments.           |
| Comms            | Meta WhatsApp Cloud API + Resend (email) + Twilio (SMS / voice) | Already deployed on the bot side. |
| Voice AI         | ElevenLabs + Twilio Programmable Voice   | V3 feature (cloned voice for reminders / win-back).       |
| Hosting          | Vercel (frontend) + Supabase (backend) + Railway (existing bot) | Standard.                              |

## MVP scope (V1)

The first six features ship together. They form the smallest set that
already justifies the £49 plan to a new tenant.

1. **Booking engine + Google Calendar 2-way sync.** Each staff member
   connects their own Google Calendar; the platform reads availability
   via `freebusy.query` and writes events via `events.insert`. Manual
   blocks added in Google Calendar (lunch, off-time) automatically
   disappear from the booking page.
2. **Google Reviews booster.** After every completed booking, an NPS
   prompt (1–10) goes out. Promoters (8+) get a one-tap deep link to
   the Google review form. Detractors (≤7) get a private feedback
   channel. Dashboards track click-through rate.
3. **Deposit pre-payment.** Optional deposit per service to cut
   no-shows. Stripe payment intents tied to the booking record.
4. **Smart upsell at checkout.** When a client books online, the
   confirmation page surfaces the most relevant package or membership
   for their profile (e.g. trial → 10-pack, single session → membership).
5. **Win-back automation.** Clients who haven't booked in N days (60
   default) receive a personalised WhatsApp + email with a friendly
   come-back nudge.
6. **Memberships / subscriptions.** Recurring plans (Stripe-billed)
   that grant a credit balance redeemable against bookings.

## Additional V1 features (added 2026-04-27)

7. **Admin dashboard.** Owner / admin / staff roles via `tenant_members`.
   Inbox, calendar, clients, services, settings.
8. **Client portal.** Each client logs in and sees: their upcoming
   bookings, their session history, their progress (metrics + photos),
   and they can add their own personal notes.
9. **In-app chat.** Two-way messaging between client and studio inside
   the platform. The same `chat_threads` table also surfaces the
   WhatsApp bot conversations, so staff has a single inbox.
10. **Flash slot feed.** Same-day cancellations and manually-opened
    slots appear on a public/private feed clients can grab. Optional
    discount per slot.

## Phase 2 / V2 candidates

Birthday automation, gift cards, referral loyalty, voice AI reminders,
white-label theming for new tenants, public marketplace ("Book at
Astrabody" SEO landing pages), tenant onboarding wizard.

## Repo layout

```
astrabody-platform/
├── README.md                   ← this file
├── docs/
│   └── google-calendar-setup.md ← one-time Google Cloud setup
├── sql/
│   └── migrations/
│       ├── 001_multitenant_core.sql
│       └── 002_client_portal_chat_flash.sql
├── src/
│   ├── app/                    ← Next.js App Router pages
│   ├── lib/
│   │   ├── supabase/           ← Supabase clients (server + browser)
│   │   ├── google-calendar/    ← OAuth + freebusy + events.insert
│   │   └── stripe/             ← deposits + subscriptions
│   └── components/             ← shadcn/ui + bespoke
├── package.json                ← (next step)
└── .env.local.example          ← (next step)
```

## Local development

> All commands assume you're inside `astrabody-platform/`.

```bash
# 1. Install
npm install

# 2. Apply migrations to your Supabase project
#    (Either via Supabase Dashboard → SQL Editor → paste each file,
#     or via the Supabase CLI: `supabase db push`.)

# 3. Configure env (copy and fill in)
cp .env.local.example .env.local

# 4. Run
npm run dev
```

## Environment variables

```
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Google Calendar (see docs/google-calendar-setup.md) ---
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
GCAL_TOKEN_ENCRYPTION_KEY=

# --- Stripe ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# --- Email (Resend) ---
RESEND_API_KEY=

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Tenant model in one paragraph

Every domain table has a `tenant_id` column and an RLS policy that
allows access only when `tenant_id` is in the current user's tenant
set (computed by `current_user_tenant_ids()`). Service-role calls
(bot, edge functions, cron) bypass RLS and pass `tenant_id` explicitly.
Clients log in via Supabase Auth and are linked to a `clients` row via
`client_portal_links`; their portal RLS uses `current_user_client_ids()`.
That's the entire isolation story — no separate Postgres schemas, no
per-tenant deployments.

## Roadmap snapshot

| Phase | Weeks | Output |
|-------|-------|--------|
| MVP   | 1–3   | Booking + GCal sync + admin dashboard, Astrabody-only |
| V1    | 4–6   | Reviews booster, deposits, upsell, win-back, memberships, client portal, chat, flash slots |
| V2    | 7–10  | Multi-tenant onboarding wizard, white-label theming, voice AI reminders |
| V3    | 11–16 | First paying external tenant, voice AI 2-way, marketing site |

## Source-of-truth docs

- `/Astrabody/CLAUDE.md` — business identity, voice, brand colours
- `/Astrabody/Astrabody_Platform_Vision.md` — strategic vision + 80/80 scoring
- `/Astrabody/Knowledge_Base/` — services, packages, voice, FAQ
- `/Astrabody/persuasion-psychology/SKILL.md` — copy frameworks reused everywhere
