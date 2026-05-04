# Antigravity — Prompts pour Astrabody Platform

> Comment utiliser ce document : tu colles le **Prompt 0** en premier
> dans un nouveau projet Antigravity, après avoir uploadé le dossier
> `astrabody-platform/`. Tu attends la fin de la tâche, tu vérifies le
> résultat (l'app tourne en preview), puis tu passes au **Prompt 1**,
> et ainsi de suite.
>
> Tous les prompts sont en anglais (les agents codent mieux en anglais
> et évitent ainsi de générer du copy français par accident). Les
> commentaires entre prompts sont en français pour toi.

---

## Préparation (à faire une seule fois)

1. Crée un nouveau projet Antigravity vide.
2. Upload tout le dossier `/Astrabody/astrabody-platform/` (drag & drop
   sur l'éditeur ou via "Import folder"). Tout le scaffolding est déjà
   là — schémas SQL, design system, premiers composants.
3. Dans Antigravity → Settings → Secrets, ajoute ces clés :

```
NEXT_PUBLIC_SUPABASE_URL=https://sctwmwhwzphbtejagsxd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copie depuis bot/.env.local>
SUPABASE_SERVICE_ROLE_KEY=<copie depuis bot/.env.local>
ANTHROPIC_API_KEY=<copie depuis bot/.env.local>
STRIPE_SECRET_KEY=<à créer sur stripe.com → API keys>
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
GOOGLE_OAUTH_CLIENT_ID=<après avoir suivi docs/google-calendar-setup.md>
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
GCAL_TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
RESEND_API_KEY=<à créer sur resend.com>
```

4. Ouvre le chat agent et colle le Prompt 0.

---

## PROMPT 0 — Bootstrap & orientation

> 👉 **Le tout premier prompt à coller.** Il oriente l'agent sur ce qui
> existe déjà et ce qu'il ne doit pas refaire.

```
You are the lead engineer on the Astrabody Platform — a multi-tenant SaaS
booking and retention platform for premium wellness clinics. Tenant 1 is
Astrabody (a UK premium aesthetic clinic in Chandler's Ford). The platform
will be resold to other small businesses (salons, restaurants, clinics) at
£49–£199/mo per tenant.

CRITICAL — read these files first, in this order, before doing anything:
1. README.md — overall scope and 10 V1 features
2. docs/design-dna.md — Apple-first design system, with Stripe for checkout
3. docs/design-preview.html — open this in the in-app browser to see the
   target visual aesthetic
4. sql/migrations/001_multitenant_core.sql
5. sql/migrations/002_client_portal_chat_flash.sql
6. sql/migrations/003_push_loyalty.sql
7. ../Astrabody_Loyalty_Strategy.md (one folder above) — the Inner Circle
   loyalty programme strategy
8. ../CLAUDE.md (one folder above) — brand identity, voice, prices
9. ../Knowledge_Base/03_voix_et_ton.md — UK English voice and tone
10. tailwind.config.ts and src/app/globals.css — design tokens already wired

Already shipped (DO NOT regenerate these — extend them only when asked):
- Next.js 15 + React 19 scaffold (package.json, tsconfig, next.config.ts)
- Tailwind config with all Astrabody design tokens
- shadcn-compatible CSS variables wired to brand palette (so 21st.dev
  components plug in automatically)
- src/components/loyalty/LoyaltyHeroCard.tsx
- src/components/portal/{UpcomingSessionCard,ProgressCard,FlashSlotCard,
  BottomNav}.tsx
- src/components/ui/{button,card}.tsx
- src/app/portal/{layout,page}.tsx — home with mock data
- public/manifest.json (PWA config)

Your first task: install dependencies and run the dev server in preview
mode. Confirm the /portal home page renders correctly with the mock data,
and tell me what you see. Do not start any feature work yet — I will give
you focused prompts one at a time after this.

Brand non-negotiables you must respect throughout:
- **Apple is the primary design canon.** Every decision on motion, shadow,
  blur, corner radius, focus state, type rhythm, tap feedback, and surface
  layering defers to Apple's design language by default. Concretely: iOS
  motion curve `cubic-bezier(0.32, 0.72, 0, 1)`, three-layer neutral
  shadows (no coloured shadows, no heavy single drops), glass with
  `backdrop-filter: blur(24px) saturate(180%)`, `:focus-visible` rings only
  (no `:focus`), scale-down 0.97 active state on every interactive surface,
  tabular-nums on every numeral, ONE accent per viewport. **Stripe** is the
  ONLY exception, used exclusively on the checkout / payments surface (cart,
  PaymentElement, summary, success state). Linear / Notion / Airbnb /
  Superhuman / Revolut / Claude are reference brands consulted only when
  Apple has no opinion on a specific pattern. Full hierarchy in
  docs/design-dna.md §9.
- All client-facing copy in UK English. Never American spelling.
- Voice: human, warm, premium, never robotic. No "Thank you for reaching
  out", no "Please feel free to", no marketing-speak.
- No em-dashes anywhere in copy. Use commas, full stops or parentheses.
- One emoji at most per surface, ✨ or 🌿 only, sparingly.
- Palette: cream / sand / sage / sage-deep / sage-light / olive only. No
  pure white, no pure black, no fire-engine red.
- Typography: Cormorant Garamond for editorial moments only (hero titles,
  big numbers in cards). Inter for everything else. Never weight 600+.
- Money is stored in pence (integer). Display via formatGBP() in lib/utils.
- Numbers always tabular-nums.
- Multi-tenant invariant: every tenant-scoped table has a tenant_id and an
  RLS policy. Never bypass RLS in app code; if you need to, use the
  service_role client and document why.

Output checklist for this first task:
- [ ] Dependencies installed
- [ ] Dev server running on /portal showing the mock home page
- [ ] A short summary of any deviations from the design preview you noticed
- [ ] Confirmation you have read and internalised the 10 files listed above
- [ ] Explicit statement: "Apple-first design canon confirmed. Stripe used
      only on the checkout surface. I will not introduce gradients, shadows,
      corner radii, or motion curves that are not already in
      tailwind.config.ts."
```

---

## PROMPT 1 — Apply the SQL migrations to Supabase

> 👉 Une fois le projet qui tourne, on monte la base.

```
Apply the three SQL migrations to the Supabase project (URL and keys are
in the Antigravity secrets — NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY).

In order:
1. sql/migrations/001_multitenant_core.sql
2. sql/migrations/002_client_portal_chat_flash.sql
3. sql/migrations/003_push_loyalty.sql

Use the Supabase JS admin client with the service-role key, or call the
Supabase Management API. Run each migration file as a single transaction.
Confirm afterwards by querying:
- SELECT count(*) FROM public.tenants — should be 1 (Astrabody seeded)
- SELECT count(*) FROM public.loyalty_rewards — should be 7

Then build a one-off seed script at sql/seeds/01_astrabody_services.sql
that inserts the Astrabody service catalogue into public.services for the
Astrabody tenant, using prices from /Astrabody/CLAUDE.md (FREE InfraBike
trial, £39 trial combo, £80 EMS, £160 Fat Freezing per zone, packages
£119, £239, £519, £699, etc.). Apply it the same way.

Output: confirmation that all three migrations and the seed are in. List
the count of rows in each major table after.
```

---

## PROMPT 2 — Wire Supabase into the app

> 👉 Brancher l'auth + les clients server/browser.

```
Build the Supabase wiring per Next.js 15 App Router conventions.

Create:
- src/lib/supabase/server.ts — server-side client using @supabase/ssr,
  reading cookies. Export createServerSupabase().
- src/lib/supabase/browser.ts — browser client. Export createBrowserSupabase().
- src/lib/supabase/admin.ts — service-role client (server-only, never imported
  from a "use client" file). Export createAdminSupabase().
- src/middleware.ts — refreshes the auth session cookie on every request,
  using @supabase/ssr's createServerClient pattern. Skip for /api/_health
  and static files.

Also add magic-link auth for clients:
- /portal/login — page with a single email input + "Send me a link" button.
  On submit, calls supabase.auth.signInWithOtp({ email, options: {
  emailRedirectTo: `${origin}/api/auth/callback`, shouldCreateUser: true } }).
- /api/auth/callback — exchanges the code for a session, then redirects to
  /portal.

Design rules: the login page reuses Card + Button from src/components/ui.
Big Cormorant headline "Welcome to Astrabody". Inter sub copy "We'll send
you a one-tap link. No password, ever." Cream background, no logos other
than the wordmark. Sage primary button.

Do not change /portal/page.tsx yet — that's the next prompt. Just plumb
Supabase so we can read auth.uid() in server components.
```

---

## PROMPT 3 — Replace mock data with real Supabase queries on portal home

> 👉 La page d'accueil portail va lire la vraie DB.

```
Replace all uses of MOCK from src/lib/portal/mock-data.ts in
src/app/portal/page.tsx with real Supabase queries.

Create src/lib/portal/queries.ts with these typed server-side functions
(use the server Supabase client, throw if no session):
- getCurrentClient() → returns { id, firstName, initials, tenant_id }
- getLoyaltyAccount(clientId) → returns { tier, currentPoints, lifetimePoints,
  memberSince, nextReward }. Pull next_reward by querying loyalty_rewards
  ordered by cost_points where cost_points > current_points limit 1.
- getNextBooking(clientId) → returns the closest future booking row joined
  with services + staff
- getProgressSeries(clientId) → joins session_logs, extracts
  metrics->>'waist_cm' over last 8 sessions, returns the array + a delta
- getTodayFlashSlots(tenantId) → flash_slots where claimed_at is null and
  starts_at::date = today, joined with services + staff

In /portal/page.tsx, run all 5 in parallel with Promise.all and pass the
results to the same components — their prop shapes are already correct.

If there is no session, redirect to /portal/login.

Keep mock-data.ts in place for storybook-style preview; do not delete it.
```

---

## PROMPT 4 — Booking flow with Stripe checkout (Stripe-style design)

> 👉 La grosse pièce. Calendar + slot picker + paiement.

```
Build the booking flow at /portal/book with three steps:
1. /portal/book — service picker. Lists active services from public.services
   for the current tenant in Card grid. Each card shows the service name in
   Cormorant 18px, duration + price in Inter 14px, deposit amount if > 0.
2. /portal/book/[serviceId] — date + time picker. Show next 14 available
   days as a horizontal scroll of date pills. When a day is tapped, fetch
   slots for that day by calling /api/availability?serviceId=...&date=...
   which queries working_hours, time_off, existing bookings, and (if the
   staff has a google_calendar_integrations row active) the staff's GCal
   freebusy via the googleapis library. Return 30-min increments that fit
   the service duration. Render slots as a 3-column grid of time pills.
3. /portal/book/[serviceId]/checkout — Stripe-style checkout page.

The checkout page is the ONLY surface in the app that follows Stripe's
design language instead of pure Apple. Specifically:
- Two-column layout on desktop (form left, summary right). Single column on
  mobile.
- Use Stripe Elements (PaymentElement) for the card input.
- Pay button uses our Button variant="pay" — sage gradient, locked text
  "Pay £XX.XX deposit".
- Show "Secured by Stripe" small mark below the button.
- On submit, server action creates the booking with status='pending', creates
  a Stripe PaymentIntent for the deposit_pence, returns client_secret.
  Front-end confirms with Stripe; on success, calls /api/bookings/[id]/confirm
  which flips the booking to 'confirmed' and writes the matching event to the
  staff's Google Calendar via googleapis events.insert (skip silently if no
  GCal connected).
- On success: redirect to /portal/book/[id]/confirmed with a Cormorant 32px
  "You're booked." headline, the booking summary, and a "+ X points earned
  on this session" line that reads from the loyalty_rewards rate (10 pts/£).

Do NOT charge the loyalty points yet — the welcome bonus / earn happens on
session completion via a different cron, not at checkout.

Use the existing Card and Button components. Cream background everywhere
except the dark loyalty cards. No icons in the Stripe Elements — let Stripe
default styling apply, then override colours via Stripe's appearance API to
sage / cream / olive.

Output: the three pages working, a successful test booking with a deposit
appearing in Stripe and a row in public.bookings with status='confirmed'.
```

---

## PROMPT 5 — In-app chat (client ↔ studio) with Realtime

> 👉 Chat client/studio en temps réel.

```
Build the in-app chat at /portal/chat.

Use Supabase Realtime (postgres_changes channel on chat_messages where
tenant_id = my tenant). The page shows a single thread (the current client's
in_app thread; create one on first open if none exists, in chat_threads).

Layout (mobile-first):
- Sticky header with "Astrabody" wordmark in Cormorant + a small "Online"
  pill in sage if any tenant_member with role staff has an active session
  in the last 5 min.
- Scrollable thread, oldest at top, newest at bottom, auto-scroll on new
  message. Bubbles: client = right-aligned, sage-deep background, cream text,
  rounded-xl. Staff = left-aligned, white background with 0.5px hairline,
  olive text, rounded-xl. Bot = left-aligned, light cream-deep background,
  same shape as staff but with a tiny "Astrabody assistant" label above.
- Composer at the bottom: rounded-full input, sage Send button, subtle
  shadow. Pressing enter or tapping Send inserts a chat_messages row with
  author_type='client', sender_client_id=<me>, primary_channel='in_app_push'.
  Optimistic update.

When a staff member writes from the admin dashboard (built later), Realtime
pushes it to the client immediately. If the client has a registered Web Push
subscription, the server also fires a push notification with the body
"Astrabody just sent you a message". If no push subscription is alive, fall
back to a WhatsApp template message via the existing bot endpoint (TODO
comment for now — leave a function stub at lib/comms/sendWhatsAppTemplate.ts).

Use shadcn/ui's input as a base if useful. Keep the rest in our own primitives.
```

---

## PROMPT 6 — Rewards menu + redemption + gift-a-friend

> 👉 Le moteur Inner Circle côté UI.

```
Build /portal/me as the loyalty home + identity page.

Sections in order:
1. Big LoyaltyHeroCard at the top (component already exists).
2. "How you've earned" — a list of the last 10 rows from loyalty_ledger for
   the current client, formatted: each row shows Cormorant 18px points number
   (with + or − sign), Inter 14px label (display_label), Inter 12px olive-soft
   relative date.
3. "Spend your points" — a grid of all active loyalty_rewards from
   loyalty_rewards (ordered by cost_points). Each reward card: Cormorant 18px
   name, Inter 13px description, Inter 14px font-medium cost in sage-deep with
   "pts" suffix in label-caps. If current_points >= cost_points, show a sage
   "Redeem" button. If locked by tier, show a small "Insider only" pill in
   gold-soft text instead. Tap → confirmation sheet → server action calls a
   redeem RPC that:
   - Inserts loyalty_redemptions row (status='pending')
   - Inserts loyalty_ledger row with delta_points = -cost_points, reason='redemption'
   - Generates a voucher_code for discount_pence / percent_off rewards
   - For free_service rewards: redirects to /portal/book?reward=<id> with the
     redemption pre-applied (skip checkout, deposit waived)
   - For gift_friend_session: triggers the gifting flow (see below)
4. "Gift a friend" inline panel — if the client has 4000+ pts. Two inputs
   (friend name, friend phone), submit creates a loyalty_referrals row with
   a unique invite_code, sends a WhatsApp template to the friend (stub for
   now), and shows a "Sent ✨" confirmation.

Use shadcn Dialog (or its 21st.dev equivalent) for the redemption confirmation.
The reward cards are standard Card components. Apple-style tap-back on each.

Make sure every pts number uses formatPoints() and every £ amount uses
formatGBP().
```

---

## PROMPT 7 — PWA install + Web Push notifications

> 👉 Pour que la cliente installe l'app sur son écran d'accueil et reçoive les notifs.

```
Make the platform a proper PWA with installable home-screen icon and Web
Push notifications.

Tasks:
1. Add icons to /public/icons/ — generate icon-192.png and icon-512.png from
   a sage-on-cream "A" mark using a simple inline SVG → canvas conversion at
   build time (or use a placeholder solid-colour PNG for now — Nigel will
   replace with a designer asset later).
2. Add a service worker at /public/sw.js that handles push events:
   self.addEventListener('push', (e) => { ... }) → showNotification with the
   message body, sage-coloured icon, and a click action that opens
   /portal/chat (or the URL passed in the payload).
3. Register the SW from src/app/portal/layout.tsx (client component, only on
   client side, only if 'serviceWorker' in navigator).
4. Add a "Install Astrabody" subtle bottom banner that appears the first
   time a client opens /portal in Safari or Chrome and dismisses on tap or
   on install. Use the beforeinstallprompt event for Chrome; for iOS Safari,
   show a small bubble with the "Tap Share, then Add to Home Screen"
   instruction (it must be tappable to dismiss).
5. Add /api/push/subscribe (POST, accepts the PushSubscription JSON, inserts
   into client_push_subscriptions for the current client).
6. Add /api/push/send-test (POST, server-only, fires a push to the current
   client via the web-push library using VAPID keys from secrets). Generate
   VAPID keys with the web-push CLI and store the public key in
   NEXT_PUBLIC_VAPID_PUBLIC_KEY and the private key in VAPID_PRIVATE_KEY.

Ensure the manifest.json is wired correctly (already at /public/manifest.json
— extend the icons array to point to the new PNGs).

Test: install the PWA on an iPhone via Safari "Add to Home Screen", grant
notification permission, hit /api/push/send-test from a logged-in browser,
and confirm a notification arrives on the iPhone.
```

---

## PROMPT 8 — Google Calendar OAuth (staff side)

> 👉 Pour que Tove et Jade connectent leur Google Calendar.

```
Build the staff-side Google Calendar connect flow.

Pre-requisite: complete docs/google-calendar-setup.md (Nigel has done this
step manually if the relevant env vars are populated).

Tasks:
1. /admin/calendar — staff-only page (gated by tenant_members.role in
   ('owner','admin','staff')). Shows the current staff's google_calendar_
   integrations row state. If is_active = true: green "Connected · primary"
   chip, calendar email, last_sync_at, and a "Disconnect" button. If no
   row or is_active = false: a sage primary button "Connect Google Calendar".
2. /api/google/connect — generates the Google OAuth URL with prompt=consent,
   access_type=offline, scopes calendar + email + openid + profile, state
   parameter signed with NEXTAUTH_SECRET-style HMAC, and redirects.
3. /api/google/callback — exchanges code for tokens, encrypts the
   refresh_token with GCAL_TOKEN_ENCRYPTION_KEY (use crypto.subtle AES-GCM,
   wrap in helper at lib/crypto/tokens.ts), upserts a google_calendar_
   integrations row for the current staff, redirects to /admin/calendar with
   a "Connected ✨" toast.
4. /api/google/disconnect — sets is_active = false, calls
   https://oauth2.googleapis.com/revoke with the refresh token, deletes the
   row.
5. lib/google-calendar/freebusy.ts — exports getFreeBusyForStaff(staffId,
   timeMin, timeMax) → returns busy slots from GCal. Used by the booking
   availability API.
6. lib/google-calendar/events.ts — exports createEventForBooking(bookingId)
   which writes an event with summary "<service>", description "<client name>
   · booked via Astrabody Platform", start/end from the booking, attendees
   = [client.email, staff.email].

Use the official googleapis npm package. Refresh tokens whenever the access
token has < 5 min left. Surface a clear "Re-connect" CTA in /admin/calendar
when a refresh fails (e.g. user revoked access).
```

---

## PROMPT 9 — Admin dashboard (staff side)

> 👉 Pour Nigel/Tove/Jade : voir les bookings, le chat, les clients, les loyalty stats.

```
Build the admin dashboard at /admin (staff-only, gated by tenant_members
role >= staff).

Pages, all using the existing design DNA:
- /admin — today's overview. Three stat cards top row: today's bookings,
  unread chat messages, members at Inner Circle tier. Below, "Today's
  schedule" list with each booking row clickable.
- /admin/bookings — calendar view (month + day toggles). Use
  @fullcalendar/react with our colour theme overridden to cream / sage.
  Click a booking → side sheet with details + cancel + reschedule actions.
- /admin/inbox — chat inbox listing all chat_threads ordered by
  last_message_at desc. Click → full thread view with composer (same
  bubble design as the client side, mirrored). Mark messages as read on
  open.
- /admin/clients — paginated list of clients with search by name / phone /
  email, sortable by last_booking_at, total_spend_pence, lifetime_points.
- /admin/loyalty — KPIs from Astrabody_Loyalty_Strategy.md §11: active
  members, expiry-nudge redemption rate, members at each tier, referrals
  per active member per quarter, Double Points week toggle.
- /admin/settings — tenant config (name, brand colours, timezone), staff
  list with role management, working_hours editor.

Use shadcn DataTable, Tabs, Sheet primitives. Anything more complex import
from 21st.dev — they're already wired to our tokens via globals.css.
```

---

## PROMPT 10 — Reviews booster engine (the killer feature)

> 👉 Le mécanisme NPS post-séance qui amène les Google Reviews.

```
Build the Google Reviews booster end-to-end.

Trigger: 4 hours after a booking flips to status='completed', a cron
(Supabase Edge Function on schedule "*/15 * * * *" or Vercel cron) creates a
review_requests row and sends the NPS prompt via the appropriate channel
(WhatsApp first, in-app push second, email third).

NPS message: "How was your session today, {{client.firstName}}? On a scale
of 1-10, how likely are you to recommend Astrabody to a friend?". Reply
captured by the bot webhook (extend bot/src/system-prompt.md handling).

Routing logic:
- If score >= 8 → send a follow-up message with the Google review deep link:
  "Thank you ✨ Would you mind sharing a quick word on Google? It really
  helps our team. https://g.page/r/<placeId>/review". Set google_link_sent_at.
- If score <= 7 → send a private follow-up: "Sorry to hear it wasn't perfect.
  What would you change? Your feedback goes straight to Nigel — nobody else."
  Capture the response into private_feedback.

In the platform:
- /portal/me show the NPS prompt as an in-app card if there is an unanswered
  review_request for the current client.
- /admin/reviews → dashboard with conversion funnel (NPS sent → answered →
  google_link_clicked → public review observed). Pull observed reviews via
  the Google Place Details API daily and reconcile by date.

Award the +500 loyalty bonus when google_link_clicked_at is set
(loyalty_ledger insert with reason='review_5_star'). The trigger we already
have on loyalty_ledger updates the cached balance automatically.
```

---

## Ordre suggéré + temps estimé

| # | Prompt                          | Temps agent estimé |
|---|---------------------------------|--------------------|
| 0 | Bootstrap                       | 5 min              |
| 1 | Apply migrations                | 10 min             |
| 2 | Supabase wiring + auth          | 30 min             |
| 3 | Real data on portal home        | 25 min             |
| 4 | Booking flow + Stripe checkout  | 90 min             |
| 5 | In-app chat + Realtime          | 60 min             |
| 6 | Rewards + gift-a-friend         | 60 min             |
| 7 | PWA + Web Push                  | 60 min             |
| 8 | Google Calendar OAuth           | 60 min             |
| 9 | Admin dashboard                 | 120 min            |
| 10| Reviews booster                 | 90 min             |

Total : ~10–11h d'agent pour shipper le V1 complet. À 3-4h par jour de travail
en allers-retours avec les agents, c'est faisable en **3 jours**.

## Règle d'or pour chaque prompt

Avant de passer au suivant :
1. Ouvre la preview dans Antigravity, vérifie que ça marche
2. Si quelque chose n'est pas bon, demande à l'agent : *"Look at the design
   preview in docs/design-preview.html again and fix any deviation."*
3. Si l'agent ajoute du copy en français, dis : *"All client-facing copy must
   be UK English. Rewrite the strings in <file>."*
4. Si l'agent invente un prix, rappelle : *"Pricing is in /Astrabody/CLAUDE.md
   — never invent."*

## Si ça part en sucette

Garde-fous à coller dans n'importe quelle conversation où l'agent s'écarte :

```
Stop. Re-read docs/design-dna.md. Three rules to respect immediately:
1. Cream / sage / olive only. No fire-engine red, no pure white, no
   rainbow status colours.
2. Cormorant Garamond is for editorial moments only — hero titles, big
   numbers in cards. Inter for everything else. Never weight 600+.
3. UK English in every string visible to a client. Voice rules in
   ../Knowledge_Base/03_voix_et_ton.md.
Re-read those, then redo the last task.
```

Cela suffit habituellement à le remettre dans les rails.
