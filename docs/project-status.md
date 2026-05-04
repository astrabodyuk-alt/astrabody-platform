# Astrabody Platform — Project Status
*Last updated: 2026-05-03*

---

## ✅ DONE — Everything built and shipped

| Prompt | Feature | Status |
|--------|---------|--------|
| 9.4 | Practitioner picker + staff profiles (photo, bio, specialties) | ✅ Done |
| 9.5 | Loyalty wallet + price combiner (points + vouchers at checkout) | ✅ Done |
| 9.6 | Staff commissions + "sold by" + /admin/payroll + /admin/me | ✅ Done |
| 9.6.5 | Service packs & in-store sales (/admin/sales) | ✅ Done |
| 9.7 | Finance reports + AI coach + accountant export (PDF/CSV) | ✅ Done |
| 9.8 | Email marketing — templates, campaigns, AI assist, history, dispatcher | ✅ Done |
| 9.9 | Card on file + no-show / late-cancel auto-charge (Stripe off-session) | ✅ Done |
| 10 | Reviews booster — NPS, Google deep-link, -15% voucher on confirmation | ✅ Done |
| 11 | Digital products shop (/portal/shop — Nutrition Blueprint) | ✅ Done |
| 11.5 | Multi-resource per service (Bike 1 / Bike 2) + client reschedule | ✅ Done |
| 12 | Notification system — bell, badges, home banners, monthly payroll cron | ✅ Done |
| 13 | White-label + tenant onboarding wizard (/onboard) | ✅ Done |
| 14 | Design polish — EmptyState, HeroCard, StatCard, micro-interactions sweep | ✅ Done |
| 15 | Staff time-off + studio closures + AI settings assistant drawer | ✅ Done |
| 16 | Bank holiday planner + universal client comms proposals | ✅ Done |
| 17 | E-gift cards + client referral programme | ✅ Done |
| 18 | Waitlist + "Book again" shortcut | ✅ Done |
| 19 | Pre-appointment intake / consultation forms | ✅ Done |
| 20 | Customer journey analytics (/admin/analytics) | ✅ Done |
| 21 | In-portal AI booking assistant (Siri-style bubble) | ✅ Done |

**SQL migrations applied:** 001 → 025
*(019 holidays+AI, 020 loyalty double points, 021 bank holidays+comms, 022 gift cards+referrals, 023 waitlist, 024 intake forms, 025 win_back trigger kind — all applied)*

---

## 🟡 TO BUILD — Next features

### ⚠️ 2 env vars à ajouter dans Vercel
- `NEXT_PUBLIC_STUDIO_PHONE` = `+44 7393 102167`
- `NEXT_PUBLIC_STUDIO_ADDRESS` = `149 Hursley Road, Chandler's Ford, Eastleigh`
Sans ça, l'assistant IA ne peut pas donner le numéro du studio aux clientes.

---

### Prompt 17 — Gift Cards + Client Referral Programme
**Full spec:** `docs/antigravity-prompts-v2.md` → PROMPT 17

**Part A — E-Gift Cards:**
- New table `gift_cards` (code, balance, recipient, Stripe payment FK, partial redemption)
- Purchase flow in /portal/shop → "Gift a Session" card with denominations (£39 / £80 / £160 / Custom)
- Beautiful email to recipient with unique code + CTA button
- Redemption at checkout (same pattern as loyalty points / vouchers)
- Admin tab: /admin/settings → "Gift Cards" (list, search, void, manual issue)
- **Migration needed:** gift_cards table

**Part B — Referral Programme:**
- New table `referrals` + `referral_code` column on clients
- Each client gets a unique share link (/portal/book?ref=CODE)
- Referred friend completes first booking → both earn £10 loyalty credit
- /portal/me → "Refer a Friend" section with WhatsApp share button
- Admin: client profile → "Referrals" tab; settings → Loyalty tab toggle
- **Migration needed:** referrals table + clients.referral_code column

---

### Prompt 18 — Waitlist + "Book Again"
**Full spec:** `docs/antigravity-prompts-v2.md` → PROMPT 18

**Part A — Waitlist:**
- New table `waitlist_entries` (service, date, preferred window, notify flag)
- When SlotPicker finds no availability → "Join the waitlist" CTA
- On booking cancellation: fire-and-forget notifyWaitlistForSlot() → WhatsApp ping
- Admin: /admin/bookings → "Waitlist" tab
- **Migration needed:** waitlist_entries table

**Part B — "Book Again":**
- "Book again" pill button on each past booking in /portal/me
- Pre-selects same staff, skips practitioner picker
- "Your usual" section at top of /portal/book for clients with 2+ same-service bookings

---

### Prompt 19 — Pre-appointment Intake Forms
**Full spec:** `docs/antigravity-prompts-v2.md` → PROMPT 19

- New tables: `intake_forms` (template builder) + `intake_responses` (per booking, token-based)
- Admin form builder in /admin/settings → "Intake Forms" tab
- 4 built-in templates: Fat Freezing health check, Laser skin assessment, EMS baseline, General wellness
- Clients receive a secure link 24h before appointment (WhatsApp + email)
- Public form page /intake/[token] — no auth, mobile-optimised, signature pad
- Booking detail drawer shows response status + "View answers" + "Download PDF"
- **Migration needed:** intake_forms + intake_responses tables

---

### Prompt 20 — Customer Journey Analytics
**Full spec:** `docs/antigravity-prompts-v2.md` → PROMPT 20

- New /admin/analytics page (owner/admin only)
- 4 KPI cards: avg booking value, repeat client rate, no-show rate, revenue per client
- 6-stage visual funnel: New client → First booking → Completed → Returned → Package → Regular
- Plain-English auto-generated insight ("Of every 10 new clients, X came back...")
- Retention heatmap (12 weeks × 7 days, CSS grid, sage fill intensity)
- Top services + top clients tables
- Win-back candidates (lapsed 60d+) with "Send win-back message" → CommsProposalBar
- **No new migration needed** — all queries on existing tables

---

## ⚪ POST-DEPLOY — Non-blocking, do after launch

These are all marked with `// TODO` in the codebase. Not needed for launch.

| Item | File | Notes |
|------|------|-------|
| WhatsApp send stub | `src/app/portal/me/actions.ts:390` | Replace stub with real bot endpoint when WhatsApp bot is live |
| Vercel API CNAME automation | `src/app/admin/settings/DomainForm.tsx:141` | Auto-verify custom domains via Vercel API (`VERCEL_TOKEN`) |
| Email broadcast job queue | `src/app/admin/emails/actions.ts:146` | Move bulk sends to a queue; currently sends synchronously |
| Admin inbox Realtime | `src/app/admin/inbox/page.tsx:14` | Add Supabase Realtime for live message updates (currently polling) |
| SlotPicker 14-day pre-fetch | `src/app/portal/book/[serviceId]/SlotPicker.tsx:16` | Pre-fetch all 14 days on mount instead of on-demand per day |
| FullCalendar for admin bookings | `src/app/admin/bookings/page.tsx:15` | Upgrade to drag-to-reschedule week/month calendar grid |
| Stripe Connect (multi-tenant) | `src/app/portal/book/[serviceId]/checkout/actions.ts:94` | Swap to destination charges when reselling to other tenants |
| "Notify affected clients" bulk action | `src/app/admin/settings/ScheduleEditor.tsx` | Bulk message clients when a closure overlaps their bookings |
| Cron: bank holiday reminders | `src/app/api/cron/bank-holiday-reminders/route.ts` | Add CRON_SECRET + schedule daily 08:00 UTC in vercel.json |
| Cron: comms proposals expiry | `src/app/api/cron/comms-proposals-expiry/route.ts` | Add CRON_SECRET + schedule daily 09:00 UTC in vercel.json |

---

## 📋 Stack reminder

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15 App Router + Tailwind 3.4 + shadcn |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions + Realtime) |
| Calendar | Google Calendar API v3, OAuth2 per staff |
| Payments | Stripe (deposits, subscriptions, off-session charges) |
| Comms | Meta WhatsApp Cloud API + Resend (email) |
| Push | Web Push (VAPID) via `web-push` lib |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## 🗂️ Key files

```
astrabody-platform/
├── docs/
│   ├── antigravity-prompts-v2.md       ← Full feature specs (Prompts 9.4–20)
│   ├── project-status.md               ← THIS FILE
│   ├── competitive-audit-may-2026.md   ← Audit vs Treatwell/Fresha/Mindbody etc.
│   ├── design-dna.md                   ← Visual canon (read before any UI work)
│   └── design-preview.html             ← Live visual reference
├── sql/migrations/
│   ├── 001–020                         ← Applied ✅
│   └── 021_bank_holidays_and_comms.sql ← Apply in Supabase Dashboard 🔴
└── src/
    ├── app/admin/                       ← All admin pages
    ├── app/portal/                      ← All client-facing pages
    ├── app/onboard/                     ← Tenant onboarding wizard
    └── app/api/                         ← API routes (availability, GCal, Stripe, push, cron)
```
