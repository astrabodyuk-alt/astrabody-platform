# CLAUDE.md — Astrabody Platform

> Read this on every turn. Everything in this file is non-negotiable.
> Detailed context lives in the files listed in §2 — read those once at
> session start, then come back here for the rules.

---

## 🛑 ABSOLUTE RULE — READ THIS EVERY SINGLE TURN, BEFORE WRITING ANY CODE

**You will NEVER deviate from `docs/design-dna.md`. Ever. No exceptions.**

This is the single most important rule in the entire project. It overrides
everything else. Before you write a single line of UI code, before you add
a single colour, shadow, corner radius, font weight, font size, line
height, animation, transition, spacing value, or any other visual property
— you will:

1. Open `docs/design-dna.md` and find the matching token.
2. Open `tailwind.config.ts` and confirm the token exists.
3. If the token does not exist: STOP. Ask Nigel. Do not invent. Do not
   approximate. Do not "use a sensible default".

**The design canon is Apple, with Stripe used only on the checkout surface.**
Nothing else. No Material Design instincts. No "modern SaaS" gradients.
No fire-engine reds. No drop shadows with black at 30% alpha. No
`border-radius: 4px`. No 600+ font weights. No purple accents. No icons
larger than the body text. No bouncy animations. No confetti. No emoji
strings.

If you find yourself about to write `style={{ ... }}` with a hex value, a
custom shadow, a custom radius, a custom motion curve, or any other
hard-coded visual property: **STOP**. That is the deviation. Re-read
`docs/design-dna.md §3` (tokens) and `§4` (component patterns), then use
the closest existing Astrabody token. If none fits, the answer is "ask
Nigel", not "invent one".

**Whenever you complete a UI task, your last action before reporting
back is to re-read `docs/design-dna.md §3` and verify, item by item,
that nothing in your output deviates from it.** If you find a deviation,
fix it before you report back. Do not ship deviations and apologise
afterwards. Ship correct, then report.

This rule has zero tolerance. A pixel-perfect Astrabody is the difference
between a £49/mo SaaS and a £199/mo SaaS. Treat every UI surface like an
Apple product launch — restrained, considered, immaculate.

---

## 1. Mission

Multi-tenant SaaS for premium wellness clinics. Tenant 1 = Astrabody (UK).
Resellable to salons, restaurants, clinics at £49–£199/mo per tenant.

## 2. Detailed context (read once, then trust this file)

| File                                            | When to read                          |
|-------------------------------------------------|---------------------------------------|
| `README.md`                                     | Architecture + V1 scope               |
| `docs/design-dna.md`                            | Before any UI work                    |
| `docs/design-preview.html`                      | Visual canon (open in browser)        |
| `sql/migrations/001_*.sql` … `003_*.sql`        | Before any DB query / new table       |
| `docs/inherited/loyalty-strategy.md`            | Before any loyalty / rewards work     |
| `docs/inherited/astrabody-business-context.md`  | Brand identity, prices, hours         |
| `docs/inherited/voice-and-tone.md`              | Voice and tone (UK English)           |
| `docs/google-calendar-setup.md`                 | Before any GCal OAuth work            |
| `docs/antigravity-prompts.md`                   | If you are an Antigravity agent       |

## 3. HARD RULES — break any of these and the work is rejected

1. UK English on every client-facing string. No American spelling. Match the client's language only if they write to us in another language first.
2. No em-dashes anywhere in copy. Use commas, full stops, parentheses.
3. One emoji at most per surface. ✨ or 🌿 only, sparingly. Never strings.
4. Palette: cream `#F6F3EE`, sand `#DED2C3`, sage `#758564`, sage-deep `#5C6B4E`, sage-light `#BBC4AA`, olive `#3E3E31`. Plus: terracotta `#C9623F` for success, gold `#B8945A` for Inner Circle accents only, destructive `#D45B5B` for errors only. **No pure white. No pure black. No fire-engine red.**
5. Typography: Cormorant Garamond for editorial moments only (hero titles, big numbers in cards). Inter for everything else. Two weights per family (400 + 500). **Never 600 or higher.**
5b. **Apple is the primary design canon for everything.** Motion curves (`cubic-bezier(0.32, 0.72, 0, 1)`), three-layer neutral shadows, glass with `saturate(180%)`, `:focus-visible` only, scale-down tap on press, tabular-nums on every numeral, single accent per viewport. **Stripe** is used only for the **checkout / payments surface** (PaymentElement, weight-300 totals, monospace card data, sage gradient pay button). Other brands (Linear / Notion / Airbnb / Superhuman / Revolut / Claude) are referenced only when Apple has no opinion on a specific pattern. Full hierarchy: `docs/design-dna.md` §9. **If you are about to add a gradient, a shadow, a corner radius, or a motion curve that is not in `tailwind.config.ts` — STOP. Re-read design-dna.md §3 first.**
6. Numbers: tabular-nums everywhere. Money stored in pence (integer). Display via `formatGBP()` from `@/lib/utils`. Points via `formatPoints()`.
7. Prices come from `docs/inherited/astrabody-business-context.md`. Never invent a price. If unsure, ask Nigel.
8. Multi-tenant invariant: every domain table has `tenant_id` and an RLS policy. App code uses the user-scoped Supabase client. Service-role client only in server-only files; document why each time.
9. No new colours, no new shadow values, no new corner radii. Use `tailwind.config.ts` tokens. If a token is missing, add it to the config — don't inline a hex.
10. No `position: fixed` for layout (except the bottom nav). Trust the flow.

## 4. Voice — quick reference

YES: contractions ("I'll", "we're"), varied sentence length, "I" not "we", acknowledge before pivoting, ask one question at a time.
NO: "Thank you for reaching out", "Please feel free to", "I'd be happy to", "Of course!", "Great question!", "absolutely / definitely / certainly" as openers, marketing-speak ("transformation journey", "unlock your potential"), formal hedging, ALL CAPS, signing every message.

Full guide: `docs/inherited/voice-and-tone.md`.

## 5. Stack — one line each

- Frontend: Next.js 15 App Router + React 19 + Tailwind 3.4 + shadcn-compatible CSS variables (so 21st.dev components plug in) + Lucide icons.
- Backend: Supabase (Postgres + Auth + RLS + Edge Functions + Realtime + Storage). Project URL in env.
- Calendar: Google Calendar API v3, OAuth2 per staff, refresh-token-encrypted with AES-GCM.
- Payments: Stripe (PaymentIntent for deposits, Subscriptions for memberships).
- Comms: Meta WhatsApp Cloud API (existing bot), Resend (email), Twilio Programmable Voice (V3).
- Push: Web Push via the `web-push` lib + VAPID keys.
- Hosting: Vercel (frontend) + Supabase (backend).

## 6. Multi-tenant in three lines

- Every tenant-scoped table has `tenant_id uuid NOT NULL REFERENCES tenants(id)`.
- Every such table has RLS enabled and a policy gating by `current_user_tenant_ids()` (staff side) and/or `current_user_client_ids()` (portal side).
- The seed for tenant 1 (`'astrabody'` slug) is at the bottom of `001_multitenant_core.sql`. Don't re-seed it.

## 7. Pricing — Astrabody (read-only, never invent)

| Service                                     | Price        | Notes                          |
|---------------------------------------------|--------------|--------------------------------|
| InfraBike single                            | £39 / 30 min |                                |
| InfraBike trial (free, lead magnet)         | £0           | Meta Ads promise               |
| Trial-day combo InfraBike + EMS             | £39          | Trial day only                 |
| EMS SupraSculpt single                      | £80 / 30 min |                                |
| Fat Freezing single zone                    | £160         | M3Pro 360°, 8 wks between same zone |
| Laser hair removal                          | from £9      | Diode 4-in-1, 4 wks between same zone |
| Pack 4 InfraBike                            | £119         |                                |
| Pack 10 InfraBike                           | £239         |                                |
| Pack 8 EMS                                  | £519         |                                |
| Pack Fat Freezing 3 sessions × up to 3 zones | £699        |                                |
| Trial-day upsell — 10 InfraBike post-trial  | £199         | Trial day only                 |
| Trial-day upsell — 6 InfraBike + 6 EMS combo | £449        | Trial day only                 |

Groupon upsells (only if client mentions Groupon first): laser zone 2 £199, EMS 5 sessions £249, FF 2nd session £199.

**Never mention Groupon to a direct lead — protects margin.**

## 8. Loyalty constants

- Earn rate: 10 pts per £ on completed bookings.
- Tiers (lifetime points): Friend 0 / Insider 1500 / Inner Circle 10000.
- Welcome bonus: 100 pts. Birthday: 500. 5★ review: 500. Referral signup: 1000. Referral first-booking: 1000. Streak 3+ months: 200/mo.
- Expiry: 12 months rolling. 30-day pre-expiry nudge.
- Gift-a-friend trial: 4000 pts. Gift card conversion: 100 pts = £1, min 1000 pts.

Full design: `../Astrabody_Loyalty_Strategy.md`.

## 9. Conventions

- Path alias: `@/*` → `src/*`.
- Server Supabase: `import { createServerSupabase } from "@/lib/supabase/server"`.
- Browser Supabase: `import { createBrowserSupabase } from "@/lib/supabase/browser"`.
- Admin (service role) Supabase: `@/lib/supabase/admin` — server-only, never imported from a `"use client"` file.
- Components: `src/components/<area>/PascalName.tsx`. Areas so far: `loyalty/`, `portal/`, `ui/`.
- DB queries: `src/lib/<area>/queries.ts`. Pure async functions, take a Supabase client, return typed results.
- Designate every async function with explicit return type.
- Tailwind tokens only. Inline `style={...}` is allowed for the loyalty hero gradient and a few other one-offs documented in `design-dna.md` §4. Otherwise use Tailwind classes.

## 10. Useful commands

```bash
npm install          # first time
npm run dev          # local preview
npm run typecheck    # tsc --noEmit
npm run lint
```

Migrations are applied via Supabase Dashboard → SQL Editor (paste each `sql/migrations/*.sql` file in order), or by Antigravity Prompt 1.

## 11. When in doubt

- Open `docs/design-preview.html` in Safari and copy the visual.
- Re-read `docs/design-dna.md` §3 (tokens) and §4 (component patterns).
- Read the relevant migration to see the table shape, don't guess.
- Ask Nigel before inventing prices, copy, or features.

---

*Last updated: 2026-04-27. Update this file whenever a hard rule changes.*
