# Antigravity prompts — V2 (Prompts 9.4 → 11)

> 7 prompts to copy-paste into Antigravity, in order. Each one extends
> what's already shipped in Prompts 0–9. The agent should respect the
> existing design DNA (Cormorant + Inter, sage / cream / olive,
> hairlines, Apple-canon).
>
> **Vision context** for the agent — this is a multi-tenant SaaS aiming
> to become the #1 booking + retention platform for Hampshire's premium
> beauty / wellness market. Every feature must respect 5 UX laws:
>
> 1. **Zero-config defaults** — no setup screens before first use.
> 2. **Mobile-first** — admin pages used one-hand on iPhone between clients.
> 3. **One click for daily actions** — complete, message, reschedule.
> 4. **Plain English, no jargon** — the audience is non-technical.
> 5. **Premium feel everywhere** — Apple-tier polish, not Fresha clutter.
>
> **Reusable components — never re-implement these inline:**
>
> - `Toggle` — `import { Toggle } from "@/components/ui/toggle"`. iOS-style 51×31 with white knob and shadow, sage on / iOS-grey off, 200ms ease-ios. The ONLY toggle pattern allowed in the app.
> - `Card`, `Button`, `Sheet` — already in `@/components/ui/`.
> - `cn()` — `import { cn } from "@/lib/utils"`. For conditional classes.

---

## PROMPT 9.4 — Choose your practitioner & staff profiles

```
Add practitioner choice to the booking flow + staff profiles
configurable in /admin/settings/staff. Existing staff today: Nigel
(owner), Tove, Jade.

SCHEMA — extend public.staff:
- photo_url text  (Supabase Storage path, public bucket "staff-photos")
- bio_short text  (≤ 160 chars, displayed under name on selector)
- specialties text[]  (optional tags: "Fat Freezing", "InfraBike", etc.)

Create the storage bucket "staff-photos" with public read, authenticated
write, max 5MB, image/* only.

CLIENT BOOKING FLOW (/portal/book/[serviceId]):
Add a NEW step BEFORE the date/time picker:
- Title: "Who would you like to see?"
- Subtitle: "All our practitioners are trained on this treatment."
- A horizontal row of cards (mobile: scrollable, 3+ visible on tablet),
  one per staff who has staff_services for this service. Each card:
  - Round photo (88px, fallback to initials in sage circle if no photo)
  - Name in serif (Cormorant 18px)
  - First specialty as a sage pill ("Fat Freezing specialist")
  - On tap → card scales down 0.97 (Apple haptic feel)
- A first card "Any practitioner" with a calendar icon — selected by
  default — that means "show me the earliest slot regardless of who".
- Selection persists to the slot picker via search param ?staff=<id>
  (or ?staff=any). The slot picker (existing) reads this and either
  calls /api/availability with a specific staffId or with the default
  (which is "any" → first available).

API CHANGE — /api/availability route:
- Accept optional &staffId=<uuid> query.
- If absent → current behaviour (default staff by sort_order).
- If present → use that staffId for the freebusy + working_hours +
  bookings overlap. Same slot computation logic.

CONFIRMED PAGE:
On /portal/booking/[bookingId]/confirmed, the existing line "5:00pm with
Nigel" already shows the practitioner. No change needed beyond ensuring
the Sheet on the booking row in /admin/bookings shows the same.

ADMIN — /admin/settings/staff:
Today this page lists staff and (for owners) lets you change role. Extend
each row's edit drawer to also show:
- Photo upload (drop zone + crop preview, square aspect)
  - Use Supabase Storage upload via createBrowserSupabase, public URL
    pattern: https://<project>.supabase.co/storage/v1/object/public/staff-photos/<staff_id>.jpg
- Bio (textarea, 160-char counter)
- Specialties (multi-select chips with the service catalog as suggestions)

Each staff can edit their OWN row (regardless of role); only owner/admin
can edit others'. Enforce in actions.ts.

DEFAULTS for the existing staff (seed via supabase admin client on this
deploy, idempotent):
- Tove: bio "Tove specialises in body sculpting and fat freezing. She's
  been with Astrabody since opening." specialties ["Fat Freezing", "EMS"]
- Jade: bio "Jade leads our laser hair removal protocols and InfraBike
  programmes." specialties ["Laser", "InfraBike"]
- Nigel: bio "Nigel is the founder of Astrabody. He oversees treatments
  and member care." specialties ["InfraBike", "EMS", "Fat Freezing"]
- photo_url stays null until each staff uploads — fallback to initials
  in sage circle is fine for now.

UX guardrails:
- The practitioner card row scrolls horizontally on mobile, doesn't
  reflow into a grid until ≥768px.
- Selection is required to advance (the date/time step is locked until
  one is chosen); the default "Any practitioner" satisfies this so
  busy clients can keep clicking through in 2 taps.
- No marketing puffery in the copy — keep it factual, sage, calm.
```

---

## PROMPT 9.5 — Loyalty wallet & price combiner

```
Build the client-side loyalty wallet — visible on /portal home — and
make every booking checkout calculate the cumulative price including
points + active vouchers + free-session rewards.

SCHEMA — already partly there in 003_push_loyalty.sql. Extend:

create table if not exists public.loyalty_vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('percent','amount','free_service')),
  value_pct int,            -- e.g. 15 for -15%; null if not 'percent'
  value_pence int,          -- e.g. 500 for £5 off; null if not 'amount'
  service_id uuid references services(id) on delete cascade,  -- null = any service; set if a specific free service
  source text not null,     -- 'google_review', 'referral', 'manual_admin', 'tier_unlock'
  status text not null default 'active' check (status in ('active','redeemed','expired')),
  redemption_id uuid references loyalty_redemptions(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index loyalty_vouchers_client_active_idx
  on loyalty_vouchers(client_id, status)
  where status = 'active';

RLS:
- SELECT: authenticated user where client_id = (the client linked to auth.uid())
- INSERT/UPDATE: service_role only (vouchers are issued by triggers /
  admin actions, never by the client directly)

PRICE COMBINER — server action createBookingAndIntent (already exists,
extend it):
Input: serviceId, startsAtIso, redemptionId, applyVoucherIds[]?, applyPoints?
Logic:
1. base = service.price_pence
2. If a free_service voucher in applyVoucherIds matches this service →
   final = 0, mark voucher redeemed, ignore points / other vouchers
   (free_service does NOT stack with discounts; this is the only
   stacking guardrail).
3. Else, accumulate discounts in this order:
   - Percent vouchers: final -= base * sum(value_pct) / 100
   - Amount vouchers: final -= sum(value_pence)
   - Points: 100 pts = £1; cap to whichever the client has; final -= points / 100 * 100 (in pence: final -= points)
4. final = max(final, 0)  -- Nigel said no floor; allow £0
5. Persist applied voucher IDs + points spent on the booking row
   (booking.applied_voucher_ids uuid[], booking.points_spent int)
6. Mark vouchers redeemed (status='redeemed', redemption_id=<new redemption>)
   and create a loyalty_ledger row points_spent (negative delta).
7. Return final amount; if final == 0, branch into FreeBookingFlow
   (existing).

CLIENT WALLET CARD — new card on /portal home, between the Inner Circle
balance card and Your next session:

  Heading: "Your rewards" (Cormorant 22px)
  3-row stacked layout:
    - Points: <balance> pts  · "≈ £<balance/100> off"
    - Vouchers: each active voucher as a row
      - Sage chip showing "−15%" or "−£5" or "Free InfraBike"
      - Sublabel: "Earned for your Google review · expires in 67 days"
    - Empty state if no vouchers: "Earn rewards by leaving a review,
       referring a friend, or hitting Insider tier."

CHECKOUT PRICE BREAKDOWN — extend the right-side summary card on
/portal/book/[serviceId]/checkout:

  Show line items only if rewards are available:
    Standard price          £39.00
    340 points              −£3.40
    Your −15% voucher       −£5.34
    ─────────────────────────────
    Total today             £30.26 ✨
    [ Pay £30.26 ]

  Below the price, a small toggle: "Apply my rewards" (on by default).
  When toggled off, full price is restored. This gives the client agency
  while making the discounted price the default (loss-aversion: she sees
  £30.26, toggling off would "lose" £8.74).

SEED LOGIC — when a client is created (first booking), seed her wallet
with 0 points + no vouchers. Existing clients in production stay as-is.

UX guardrails:
- Every voucher chip on the wallet AND in the checkout uses the same
  styling so they feel like the same object.
- If a voucher expires within 14 days, show a soft urgency: small
  amber dot + tooltip "Expires soon".
- The price breakdown uses tabular-nums so the £-amounts align right.
- Mobile: the wallet card collapses into a 1-line summary
  ("£8.40 in rewards · tap to see") that expands on tap.
```

---

## PROMPT 9.6 — Staff commissions & "sold by"

```
Add per-staff sales commissions to every booking + a "sold by" tag
visible across the admin views.

SCHEMA:

alter table public.staff
  add column if not exists commission_rate_pct numeric(5,2) not null default 10.00;
  -- e.g. 10.00 for 10%. Owner can override per staff in settings.

alter table public.bookings
  add column if not exists sold_by_staff_id uuid references staff(id);
  -- The person who CLOSED the sale. Often = staff_id (the practitioner)
  -- but can differ when the receptionist books for a colleague.
  -- Defaults to staff_id if null at insert time (a trigger handles that).

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,  -- who earns
  rate_pct numeric(5,2) not null,
  amount_pence int not null,           -- computed at confirmation
  status text not null default 'pending' check (status in ('pending','paid','void')),
  paid_at timestamptz,
  paid_by_user_id uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (booking_id)  -- one commission per booking
);
create index commissions_staff_status_idx on commissions(staff_id, status);

TRIGGER — on booking insert: if sold_by_staff_id is null, copy from
staff_id. Then on transition to status='confirmed', insert a commissions
row using sold_by_staff_id and that staff's commission_rate_pct (snapshot
the rate at confirmation time, don't read it live later).

ON refund / cancel after confirmed → set commissions.status='void'.
On status='completed' (already shipping in /admin/bookings actions) →
no change to commission status; it stays 'pending' until the owner
marks it 'paid' on the payroll page.

ADMIN UI:

/admin/bookings — extend the row:
- After the time + service line, add a small olive-soft line
  "Sold by Tove" or "Sold by Nigel" in 12px.
- In the side Sheet, add a row "Sold by" with a small dropdown
  (owner / admin only) to change sold_by_staff_id retroactively.
  This re-points the existing commissions row.

/admin/me — new staff-scoped page (everyone with role staff or higher
can see THEIR OWN page):
- Hero: "Your earnings" Cormorant 28px
- 3 KPI cards:
  - This month: sum of commissions where staff_id=me AND status in
    ('pending','paid') AND created_at in [start of month, now]
  - Pending payout: sum where status='pending'
  - Last paid: sum + date of most recent paid_at
- Table below: last 30 commissions with date, client first name,
  service, rate, amount, status pill.

/admin/payroll — owner-only page:
- Heading "Team payroll"
- Tabs: This month / Last month / All-time
- Table: one row per staff. Columns: name, # bookings, gross sales,
  rate, owed, paid, balance.
- Each row clickable → drawer showing the underlying commissions list
  with a "Mark all pending as paid" button at the bottom (records
  paid_at = now and paid_by_user_id = current owner).

/admin/settings/staff — extend the staff row drawer (owner-only):
- Field "Commission rate (%)" — number input with step 0.5, default 10.

UX guardrails:
- The "Sold by" line in /admin/bookings uses the staff's first name to
  feel personal, not "Sold by staff_id 1122".
- Payroll table is mobile-readable: the underlying commissions list
  collapses into a card stack on small screens.
- The "Mark as paid" action requires confirmation (a small modal) —
  this is money, can't be one-tap.
- AI nicety: on /admin/me, if the staff has earned > £200 this month,
  show a sage-tinted line "On track for your best month yet."
  (compute via comparison with last 6 months avg).
```

---

## PROMPT 9.6.5 — Service packs & in-store sales

```
Add multi-session packs (e.g. Pack 10 InfraBike £239) sold in-studio,
where staff record the sale on behalf of the client, the client's
account is credited with N remaining sessions, and bookings consume
those sessions instead of triggering a Stripe checkout.

This is critical: in premium UK salons, packs typically represent
40-60% of revenue, almost all sold in person at the front desk. Stop
making clients log in to buy a pack — let staff sell it on the spot
with cash / card terminal / bank transfer, attribute the commission
to whoever closed the sale, and credit the client's account so she
can self-book against it.

SCHEMA:

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  name text not null,                      -- "Pack 10 InfraBike"
  short_description text,                  -- "10 sessions · best value"
  sessions_count int not null check (sessions_count > 0),
  price_pence int not null,
  validity_months int not null default 6,  -- expires after N months from purchase
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.client_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  package_id uuid not null references service_packages(id) on delete restrict,
  service_id uuid not null references services(id) on delete restrict,  -- denormalised for fast booking-side lookup
  sessions_total int not null,
  sessions_remaining int not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','expired','cancelled','consumed')),
  notes text,
  created_at timestamptz not null default now()
);
create index client_packages_client_active_idx
  on client_packages(client_id, status)
  where status = 'active';

create table if not exists public.package_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_package_id uuid not null references client_packages(id) on delete restrict,
  package_id uuid not null references service_packages(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  sold_by_staff_id uuid not null references staff(id) on delete restrict,
  amount_paid_pence int not null,        -- can differ from package.price_pence (manager discount)
  payment_method text not null check (payment_method in (
    'cash','card_terminal','bank_transfer','stripe_online','gift','other'
  )),
  reference text,                         -- e.g. terminal receipt #, transfer ref
  notes text,
  refunded boolean not null default false,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists client_package_id uuid references client_packages(id);
  -- When a booking consumes a pack session, this points at the source
  -- pack. price_pence on the booking row is set to 0 in that case.

TRIGGERS:

1. On insert into package_purchases (status='active' implied):
   - Insert a commissions row using sold_by_staff_id and that staff's
     commission_rate_pct (snapshot rate at purchase time).
   - amount_pence = round(amount_paid_pence * rate_pct / 100)
   - status='pending', unique on (booking_id) is fine because we're
     inserting with booking_id=null and adding a separate uniqueness on
     (purchase_id) — extend the commissions schema:

     alter table public.commissions
       add column if not exists package_purchase_id uuid references package_purchases(id) on delete cascade,
       drop constraint if exists commissions_booking_id_key;
     create unique index if not exists commissions_booking_unique
       on commissions(booking_id) where booking_id is not null;
     create unique index if not exists commissions_package_unique
       on commissions(package_purchase_id) where package_purchase_id is not null;
     alter table public.commissions
       add constraint commissions_source_check
         check ((booking_id is not null) <> (package_purchase_id is not null));

2. On update package_purchases.refunded → true:
   - Mark client_packages.status='cancelled'
   - Mark commissions.status='void' for that purchase
   (Don't auto-restore sessions already consumed — those bookings stay,
    only the future pack value is voided.)

3. On insert into bookings WITH client_package_id set:
   - Decrement client_packages.sessions_remaining by 1.
   - If sessions_remaining hits 0 → status='consumed'.
   - bookings.price_pence is forced to 0 by the action layer.

4. On update bookings.status → 'cancelled' AND client_package_id is not null:
   - Increment client_packages.sessions_remaining by 1.
   - If was 'consumed' and now > 0 → status='active'.

5. Cron daily: mark client_packages.status='expired' where expires_at <
   now() and sessions_remaining > 0 and status='active'.

SEED service_packages for tenant 'astrabody' (idempotent on
(tenant_id, name)):

- name="Pack 4 InfraBike", service=infrabike, sessions=4, price_pence=11900, validity=6
- name="Pack 10 InfraBike", service=infrabike, sessions=10, price_pence=23900, validity=6
- name="Pack 8 EMS", service=ems, sessions=8, price_pence=51900, validity=6
- name="Pack Fat Freezing 3 rounds", service=fat_freezing, sessions=3, price_pence=69900, validity=12

ADMIN UI — new top-nav item "Sales" between Inbox and Clients (only for
role >= staff; everyone can record a sale).

/admin/sales — history view:
- Top KPI: "This month's pack revenue" + "vs last month"
- Table of package_purchases: date, client (linked), pack, sold by,
  method, amount, status (active/refunded). Click row → drawer with
  refund button (owner-only) and notes.

/admin/sales/new — create new sale:
Step 1: pick client (search bar, or "+ New client" inline form for
  walk-ins — captures name, email, phone, optionally GDPR consent
  checkbox).
Step 2: pick pack from active service_packages (cards with name,
  sessions count, price). Live computes per-session price ("£23.90 per
  session — saves £15 vs single").
Step 3: confirm sale:
  - "Sold by" defaults to current logged-in staff, dropdown to override
    (owner/admin can set anyone; staff cannot)
  - Payment method radio: Cash · Card terminal · Bank transfer ·
    Stripe online · Gift · Other
  - Amount paid (defaults to pack price, editable for discounts —
    show "Discount applied" line if below catalog price)
  - Optional reference (terminal receipt #, transfer reference)
  - Optional notes (visible to all staff later)
  - "Create sale" → INSERT package_purchases, then trigger creates
    client_packages + commissions atomically. Show confirmation:
    "Pack credited to {{client.first_name}}'s account. {{sold_by}} earns
    £{{commission_pence/100}} commission."

/admin/clients/[id] — extend existing page:
- New section "Active packs":
  - List active client_packages: name, sessions used / total, expires
    in N days, "Sold by X on date".
  - "Sell another pack" button → opens /admin/sales/new pre-filled
    with this client.
- New section "Pack history" (collapsed): all client_packages including
  expired/cancelled ones.

/admin/settings — new "Packs" tab (owner only):
- Catalogue editor: list service_packages, click any to edit (name,
  service, sessions, price, validity, active toggle). "+ New pack"
  button.

CLIENT UI — /portal home:
- New card "Your packs" between Inner Circle and Your rewards (only
  shown if active client_packages exist):
  - For each active pack: small row with sage progress bar showing
    sessions remaining out of total, expiry date, service name.
  - Tap → expands to show purchase date and remaining details.

CLIENT UI — /portal/book/[serviceId]:
- Step 3 (date/time picker) — if the client has an active pack for
  THIS service:
  - Above the slot grid, sage notice: "You have a Pack 10 InfraBike
    with 7 sessions left. This booking will use 1 session."
  - Toggle: "Use my pack" — ON by default.
  - When ON, the checkout step (step 4) skips Stripe entirely:
    "Confirm your booking" → creates the booking with
    client_package_id set, price_pence=0, status='confirmed'
    immediately. No payment screen.
  - When OFF, the normal pay flow continues (she's saving her pack for
    later, paying full price now).
- If multiple active packs cover this service, prefer the one expiring
  soonest (FIFO consumption).

API CHANGES:

In createBookingAndIntent (server action):
- Accept new arg `useClientPackageId?: string`.
- If set:
  - Validate: package belongs to client, status='active', service
    matches, sessions_remaining > 0, expires_at > now().
  - Insert booking with client_package_id set, price_pence=0,
    status='confirmed', deposit_paid=true.
  - Do NOT create a Stripe PaymentIntent. Return { free: true,
    bookingId } so the CheckoutClient routes through FreeBookingFlow.

In cancelBooking (server action):
- If booking.client_package_id is not null and status was 'confirmed'
  or 'completed' (not yet completed counts), the trigger restores the
  session. No commission to void (commissions live on the purchase row,
  not on individual sessions).

UX guardrails:
- The /admin/sales/new flow is one mobile-first column, big tap
  targets, three steps with a sticky progress bar. Optimised for Tove
  to complete a sale in under 60 seconds at the front desk on her
  iPhone.
- The "Sold by" dropdown on /admin/sales/new is the primary
  discrimination point — make it visually prominent (sage card, not a
  tiny dropdown).
- The discount field warns when below catalog price ("That's £40 off —
  are you sure?") to prevent accidental misclicks.
- The client-side "Use my pack" toggle uses the same iOS-style
  Toggle component from CheckoutSummary.tsx (51×31, white knob, sage
  on / iOS-grey off). Consistent.
- Pack progress bars use sage on cream-deep, never red — even when
  near zero, the messaging is "1 session left, plus tax-free top-up"
  rather than "RUNNING OUT". Premium feel.
- Walk-in client creation (no email yet) is allowed: store with
  email=null, prompt for it later when they install the PWA.

This unlocks a huge revenue surface for every tenant. After this prompt
ships, a salon's typical Saturday looks like: front-desk staff use
/admin/sales/new on their phone to ring up packs as clients walk in,
attributed to whoever made the sale. The owner sees real-time totals
in /admin/payroll. The client gets a portal account she can self-book
into for the next 6 months without ever opening Stripe again.
```

---

## PROMPT 9.7 — Finance reports & AI coach

```
Build /admin/finance — owner-only page showing real-time revenue with
VAT split, period comparisons, an export-for-accountant action, and an
AI-generated monthly action plan.

SCHEMA — UK VAT is at 20% standard rate. Treatments are typically
standard-rated unless the salon is below the £90k threshold (then no VAT
charged). Add to tenants:

alter table public.tenants
  add column if not exists vat_registered boolean not null default false,
  add column if not exists vat_rate_pct numeric(5,2) not null default 20.00,
  add column if not exists vat_number text;

The existing bookings.price_pence is the AMOUNT THE CLIENT PAYS (TTC).
For VAT-registered tenants, ex-VAT = price_pence / (1 + vat_rate_pct/100).
For non-registered, ex-VAT = price_pence (no VAT element).

PAGE LAYOUT — /admin/finance:

Top row, 4 KPI cards (mobile: 2x2 grid):
- "Revenue (this month)" — sum of completed/confirmed bookings'
  price_pence + product sales (from Prompt 11 later) where created_at
  in current month. Display as £X,XXX TTC + small subtitle "£X,XXX
  ex-VAT" if VAT-registered.
- "VAT collected" — only shown if vat_registered. Sum of (price_pence -
  ex_vat) per booking.
- "vs last month" — same metric, % change with arrow + absolute Δ.
- "vs same month last year" — % change. If <12 months of data, show "—".

Middle: Revenue chart (recharts):
- Line chart, last 12 months, two lines: TTC (sage-deep) and ex-VAT
  (sage-light). Stacked on mobile (1 line at a time, swipe to switch).
- Hairline grid, no fills, tabular-nums on axes.

Bottom-left card: "Export for accountant"
- Month selector (defaults to last completed month)
- Format toggle: PDF (default, formatted summary) / CSV (raw rows for
  Sage/Xero import)
- Download button → server action that:
  - Pulls bookings where status in ('confirmed','completed') and
    starts_at in [month_start, month_end]
  - Pulls deposits where paid_at in same range
  - Pulls products sold (Prompt 11) in same range
  - Computes per-row: gross_pence, vat_pence, ex_vat_pence
  - Returns either a styled PDF (use react-pdf or pdfkit) or a CSV
- File naming: astrabody-revenue-2026-04.pdf / .csv

Bottom-right card: "This month's plan" (THE AI COACH):
- Heading "Recommendations from your AI advisor" (Cormorant 22px)
- A bulleted list of 3–5 items, each one a card with:
  - Small icon (lucide: trending-up, gift, mail, calendar, zap)
  - Title (1 line, sage-deep, semibold 15px)
  - Body (2–3 lines, olive-soft 13px)
  - Optional CTA pill ("Draft email" / "Open settings")
- Below: small line "Generated <relative time>. Refreshes weekly.
  Not financial advice."
- A refresh button (owner-only, throttled to once per 24h).

AI generation server action:
- On click "Refresh" or on first load if no recommendation cached for
  this month:
  - Build a context string with: tenant.name, services list with
    prices, current month name, today's date, last 3 months' KPIs
    (bookings, revenue, top service), upcoming UK calendar events
    (Black Friday, Christmas, etc — hardcode a small calendar in
    src/lib/coach/uk-calendar.ts), the loyalty programme summary.
  - Call Anthropic API (claude-sonnet-4-6, max_tokens=1500) with the
    system prompt:
    "You are a business coach for premium UK beauty/wellness studios.
     Given the studio's context, write 3 to 5 concrete, time-bound
     marketing or operational actions for the current month. Use UK
     English. Prefer specific numbers and dates over vague advice.
     Keep each item under 30 words. Output strictly as a JSON array of
     objects {title, body, icon, cta?, cta_href?}."
  - Parse the JSON, store in a new tenants_coach_recommendations table
    (tenant_id, month_iso, recommendations jsonb, generated_at) so we
    don't burn API calls on each page load.

uk-calendar.ts — pre-seed:
- January: New Year reset campaigns, dry January
- February: Valentine's gift cards
- March: Mother's Day (UK = mid-March), Spring reset
- April: Easter, school holidays
- May: bank holidays (early + late)
- June: pre-summer body prep urgency
- July: summer holiday season
- August: kids off school, slow period — re-engagement focus
- September: back-to-school, post-holiday body resets
- October: pre-Christmas planning, Halloween
- November: Black Friday (last Friday of November)
- December: Christmas gift cards, end-of-year urgency

UX guardrails:
- The export action must complete in <3s for a typical month — if not,
  add a "Preparing your file..." toast.
- The AI recommendations card must NEVER block first paint of the page;
  if no cached recommendation, show a sage shimmer placeholder while
  it generates in the background.
- Owner-only on this page, gated in the layout.
```

---

## PROMPT 9.8 — Email marketing & lifecycle automation

```
Wire Resend (RESEND_API_KEY already in env) for both transactional
(per-event lifecycle emails) and broadcast (manual marketing campaigns
to segments) emails. All tenant-scoped, fully editable.

SCHEMA:

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null,           -- 'welcome', 'booking_confirmed', 'after_care_infrabike', etc.
  name text not null,           -- human label
  subject text not null,
  body_md text not null,        -- markdown with {{handlebars}} for variables
  trigger text not null check (trigger in (
    'manual','signup','booking_confirmed','booking_reminder_24h',
    'session_after_care','reengagement_60d','birthday','tier_unlock',
    'review_request','referral_invite'
  )),
  trigger_offset_minutes int default 0,  -- e.g. -1440 for "24h before booking", +120 for "2h after session"
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  template_id uuid references email_templates(id),
  client_id uuid references clients(id),
  to_email text not null,
  subject text not null,
  body_html text not null,
  resend_id text,                -- Resend's id for delivery tracking
  status text not null default 'queued' check (status in ('queued','sent','delivered','bounced','failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index email_sends_client_idx on email_sends(client_id, created_at desc);

create table if not exists public.email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  subject text not null,
  body_md text not null,
  segment_query jsonb not null,   -- { type: 'all' | 'inactive_60d' | 'tier' | 'service', params: {} }
  scheduled_at timestamptz,        -- null = draft / send-now
  sent_count int default 0,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed')),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

SEED — when a tenant is created (or via migration for tenant 1
'astrabody'), insert these starter templates with Astrabody-branded copy
in UK English. Use real handlebars {{client.first_name}},
{{booking.starts_at_friendly}}, {{service.name}}, {{tenant.name}}, etc.

  - welcome (trigger=signup) — subject "Welcome to Astrabody"
  - booking_confirmed (trigger=booking_confirmed) — "Your {{service.name}} session is confirmed"
  - booking_reminder_24h (trigger=booking_reminder_24h, offset=-1440) — "See you tomorrow at {{booking.time}}"
  - after_care_infrabike (trigger=session_after_care, offset=120) — "After your InfraBike session: small things that matter"
  - after_care_ems (trigger=session_after_care, offset=120) — "Your post-EMS recovery"
  - after_care_fat_freezing (trigger=session_after_care, offset=120) — "What to expect over the next 8 weeks"
  - after_care_laser (trigger=session_after_care, offset=120) — "Caring for your skin after laser"
  - reengagement_60d (trigger=reengagement_60d) — "We've been thinking about you" with a -10% voucher
  - birthday (trigger=birthday) — "Happy birthday from Astrabody" with a free InfraBike voucher
  - tier_unlock (trigger=tier_unlock) — "You're now a {{tier}} member"

The after_care_<service> templates need to be matched at send time by
service slug. The dispatcher picks the right template per booking.

SEND DISPATCHER — Edge Function or a Vercel cron (every 5 min):
- Walk pending lifecycle emails:
  - For each booking where status='confirmed' and starts_at - now()
    is in (1435m, 1445m), check booking_reminder_24h not yet sent →
    queue.
  - For each booking where status='completed' and completed_at is in
    (110m, 130m) ago, check after_care_<service.slug> not yet sent →
    queue.
  - For each client where last_booking_at < now() - 60d and no
    reengagement email in last 90d → queue.
  - For each client whose birthday is today → queue, once per year.
- Render the template (markdown → HTML, substitute handlebars), send
  via Resend, write a row in email_sends.

ADMIN UI:

/admin/emails — new top-nav item between Loyalty and Calendar.

Tab 1 — "Templates":
- List of all email_templates for this tenant.
- Click any → editor:
  - Name + subject (text inputs)
  - Body (textarea with markdown live preview, sage-tinted)
  - Variables sidebar showing available handlebars per trigger
  - Save / Preview (renders sample with mock data) / Send test (to me)

Tab 2 — "Campaigns":
- "New campaign" button → composer:
  - Name (internal), Subject, Body (markdown editor)
  - Segment picker:
    - "Everyone" (all consenting clients)
    - "Inactive (60+ days no booking)"
    - "Tier: Insider+"
    - "Booked service: Fat Freezing" / "InfraBike" / etc.
    - Live count: "This will go to 47 people"
  - Schedule: now / pick a date+time
  - Save draft / Send / Schedule
- AI ASSIST button on the body field:
  - Input: a one-line brief ("promo gift card Christmas for repeat
    clients")
  - Anthropic call: claude-sonnet-4-6, system="You are a copywriter
    for a premium UK beauty/wellness studio. Voice: warm, premium,
    UK English, no marketing-speak, contractions OK, never use
    em-dashes, acknowledge difficulty before offering solutions.
    Output a JSON {subject, body_md} where body_md is 80-160 words
    of markdown."
  - Insert result into the form.

Tab 3 — "History":
- Table of email_sends, latest first. Filterable by template, client,
  status. Click a row → preview the rendered HTML in a Sheet.

UX guardrails:
- The composer auto-saves draft every 5s.
- The "Send test" button sends to the logged-in admin's email — this
  is non-negotiable, every owner does this before broadcasting.
- The AI Assist must respect Astrabody voice rules from
  Knowledge_Base/03_voix_et_ton.md (no em-dashes, no jargon, premium).
- Resend webhook: subscribe to delivered/bounced/complained at
  /api/email/webhook and update email_sends.status accordingly. Use
  the RESEND_WEBHOOK_SECRET env var (add to .env.local.example).

Make sure the Resend FROM is "Astrabody <enquiries@astrabody.co.uk>"
(domain already verified per Prompt 0).
```

---

## PROMPT 9.9 — Card on file & no-show / late-cancel auto-charge

```
Add Stripe "save card for off-session use" + automatic charging for
no-shows and late cancellations + one-tap pack/product purchases for
returning clients. This is the killer feature that lets every tenant
stop bleeding £200-£500 per month to no-shows.

REGULATORY CONTEXT (UK / EU SCA):
- The first time a card is used, the client must authenticate (3DS).
  Stripe handles this when we set setup_future_usage='off_session' on
  the initial PaymentIntent. After that, off-session charges work
  silently UNLESS the issuer challenges (rare; Stripe handles fallback).
- Explicit consent is mandatory. The "Save my card" checkbox must NOT be
  pre-checked. The cancellation policy must be visible BEFORE the Pay
  button is clicked.
- Email notification before every off-session charge (legal requirement
  in some EU countries, best practice everywhere): "Reminder — your
  card on file will be charged £X if you don't make it tomorrow."

SCHEMA:

alter table public.clients
  add column if not exists stripe_customer_id text,
  add column if not exists default_payment_method_id text,
  add column if not exists card_brand text,            -- 'visa', 'mastercard', 'amex'
  add column if not exists card_last4 text,
  add column if not exists card_exp_month int,
  add column if not exists card_exp_year int,
  add column if not exists saved_card_at timestamptz;

create table if not exists public.client_payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  stripe_payment_method_id text not null,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_id, stripe_payment_method_id)
);

alter table public.tenants
  add column if not exists cancellation_policy_enabled boolean not null default true,
  add column if not exists noshow_charge_pct int not null default 100,
  add column if not exists late_cancel_charge_pct int not null default 50,
  add column if not exists late_cancel_cutoff_hours int not null default 24,
  add column if not exists cancellation_policy_text text;
  -- The owner can write a custom human-readable policy that overrides
  -- the auto-generated one. Falls back to a generated string if null.

alter table public.bookings
  add column if not exists noshow_charged_amount_pence int,
  add column if not exists noshow_charged_at timestamptz,
  add column if not exists noshow_payment_intent_id text,
  add column if not exists card_on_file_consent boolean not null default false;

CHECKOUT CHANGES (server action createBookingAndIntent):
- Build PaymentIntent with:
  - customer: <stripe_customer_id>  (create if first time, attach to client)
  - setup_future_usage: 'off_session'  (only if user ticked the consent
    checkbox; otherwise omit and don't save anything)
  - metadata.save_card: 'yes' / 'no'
- After successful payment confirmation, in /api/bookings/[id]/confirm:
  - If save_card='yes', read PaymentIntent.payment_method, retrieve full
    PM details from Stripe, INSERT/UPDATE client_payment_methods, set
    is_default=true (and flip all others to false), update clients
    table with brand/last4/exp + stripe_customer_id.

CHECKOUT UI (CheckoutClient.tsx):
- Above the Pay button, BEFORE the payment element:
  - A small soft-cream box, hairline border, containing:
    - Title: "Cancellation policy"
    - 3 lines summarising:
      - "No-show: {{noshow_charge_pct}}% of session price"
      - "Cancel within {{late_cancel_cutoff_hours}}h: {{late_cancel_charge_pct}}%"
      - "Cancel earlier: free, anytime"
    - If tenant.cancellation_policy_text is set, show that instead.
- Below the payment element, BEFORE the Pay button:
  - Checkbox "Save my card for future bookings (one-tap rebooking,
    auto-charge if I don't show)" — UNCHECKED by default.
  - Sub-line in olive-soft-faint 11px: "You can remove your card any
    time from /portal/account."
- Returning clients (existing default_payment_method_id):
  - Show a "Use saved card ending in •• 4242" pill above the payment
    element. Tapping it switches into "express checkout" mode: hide the
    payment element, change the button to "Pay £X with •• 4242".
  - Plus a small "Use a different card" link to fall back.

ADMIN — /admin/bookings booking detail Sheet:
- New row "Mark no-show" (replacing or alongside the existing Cancel +
  Mark completed). Tapping it opens a modal:
  - "Charge {{client.first_name}}'s card on file?"
  - "Default: £{{noshow_charge_pent_pence/100}} ({{noshow_charge_pct}}%
    of £{{booking.price_pence/100}}). You can override the amount."
  - Number input for amount (prefilled with default), with reasons
    field (text, optional, saved to bookings.notes).
  - "Charge & mark no-show" button — confirms via Stripe (off-session
    PaymentIntent on the saved PM), updates booking.status='no_show',
    booking.noshow_charged_amount_pence, booking.noshow_charged_at,
    booking.noshow_payment_intent_id.
  - On charge failure (e.g. card declined, requires_action), show the
    Stripe error and write to bookings.notes; status stays 'confirmed'
    so the staff can retry.

ADMIN — /admin/bookings cancel logic:
- The existing Cancel button now respects the policy. If the booking is
  within {{late_cancel_cutoff_hours}}h:
  - Modal: "This is a late cancellation. Charge {{late_cancel_charge_pct}}%
    (£X)?"
  - Two buttons: "Charge late fee & cancel" / "Cancel without charge"
    (audit who waived the fee in bookings.notes).
- If the booking is outside the cutoff, the existing flow runs (free
  cancel, no charge).

ADMIN — /admin/settings new "Cancellation policy" tab:
- Switch: "Enable cancellation policy" (turns the whole feature off)
- No-show charge %: slider 0-100, default 100
- Late-cancel charge %: slider 0-100, default 50
- Late-cancel cutoff hours: input, default 24
- Custom policy text: textarea (overrides auto-generated text on the
  checkout summary)
- Live preview of what the client will see at checkout.

CLIENT — /portal/account new section "Payment method":
- If client has a card on file:
  - Card row: "•• 4242 · expires 12/27 · Visa" with a small dot icon.
  - Two actions: "Replace" (opens Stripe Setup Intent flow) and
    "Remove" (deletes the PM in Stripe + database).
- If no card on file:
  - Empty state: "Add a card to enable one-tap rebooking and pack
    purchases."
  - Button: "Add a card" → opens Stripe Setup Intent flow in modal.

ONE-TAP PACK / PRODUCT PURCHASES (Prompt 11 will cover product UI; this
prompt builds the underlying API):
- New server action chargeSavedCard({ amountPence, description,
  metadata }) that creates an off-session PaymentIntent on the client's
  default PM, confirms immediately, returns success/failure.
- Used by future product/pack purchase flows (Prompt 11 will call it).

EMAIL TRIGGERS (extends Prompt 9.8 dispatcher):
- New template seed: 'booking_reminder_24h_with_policy' (reuses 24h
  reminder slot). Subject: "See you tomorrow at {{booking.time}}".
  Body includes the cancellation policy line if card is on file:
  "Just a reminder — if you can't make it, please cancel before
  {{cutoff_time}} or we'll need to charge {{late_cancel_charge_pct}}%
  per our cancellation policy."
- New template: 'noshow_charged' — sent automatically right after a
  no-show charge succeeds. "We're sorry we missed you today. Per our
  policy, we've charged £X to your card ending •• 4242."
- New template: 'late_cancel_charged' — same pattern.

RLS:
- client_payment_methods: SELECT for the owning client (RLS by
  client_id = auth.uid() chain). INSERT/UPDATE/DELETE service_role only.
- All charge actions go through server actions with service-role; never
  expose the Stripe customer/PM IDs to the client side.

UX guardrails:
- The "Save my card" checkbox copy MUST mention BOTH benefits AND the
  no-show charge. Hiding the second is bad-faith UX and risks chargebacks.
- The cancellation policy box MUST be above the payment element. Last
  thing a client should read before paying.
- The "Mark no-show" modal MUST always show the amount in £ before
  confirmation. Never one-tap a charge.
- Off-session charge errors should NEVER silently fail. Surface them in
  the booking detail Sheet so staff can retry or contact the client.
- The reminder email goes 24h before. Cron in Prompt 9.8's dispatcher
  picks it up automatically once the new template slug is seeded.
- For test mode: Stripe test card 4000 0027 6000 3184 lets you test
  off-session SCA challenges. Document this in the README for QA.

This is THE feature that, paired with the loyalty system from Prompt
9.5, lets a tenant pitch their salon as "premium concierge" rather
than "open-book Fresha grid". Worth the extra week of dev.
```

---

## PROMPT 10 — Reviews booster (smart cooldown)

```
Build the post-session review-request engine + the in-app NPS capture +
the Google review deep-link. NEVER spam clients — respect a 90-day
cooldown and milestone-based triggering.

SCHEMA:

alter table public.clients
  add column if not exists has_left_google_review boolean not null default false,
  add column if not exists last_review_request_at timestamptz;

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  trigger_booking_id uuid references bookings(id),
  trigger_reason text not null check (trigger_reason in (
    'first_session','programme_complete','milestone_5','milestone_10'
  )),
  nps_score int check (nps_score between 0 and 10),
  nps_comment text,
  google_review_clicked boolean default false,
  google_review_confirmed_at timestamptz,
  status text not null default 'sent' check (status in (
    'sent','responded','google_clicked','google_confirmed','dismissed'
  )),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index review_requests_client_idx on review_requests(client_id, created_at desc);

alter table public.tenants
  add column if not exists google_business_review_url text,
  add column if not exists review_bonus_voucher_pct int not null default 15;
  -- The -15% voucher granted after a confirmed Google review.

TRIGGERING LOGIC — extend the email dispatcher (Prompt 9.8):

When a booking is marked 'completed':
1. If client.has_left_google_review = true → never request again. Skip.
2. If client.last_review_request_at is within 90 days → skip.
3. Determine if this completion qualifies as a milestone:
   - First completed booking ever → trigger_reason='first_session'
   - 5th completed booking → 'milestone_5'
   - 10th completed booking → 'milestone_10'
   - Last booking of a recognised programme (e.g. 8th of 8 EMS,
     3rd of 3 Fat Freezing rounds, 4th of 4 InfraBike pack) →
     'programme_complete'
   - Otherwise → no trigger
4. If qualifying:
   - Insert review_requests row, status='sent'
   - Set client.last_review_request_at = now()
   - Send the review_request email template (already seeded in Prompt
     9.8 — add it there: trigger='review_request', subject "How was
     your Astrabody experience?", body links to /portal/review/[id])

CLIENT FLOW — /portal/review/[reviewRequestId]:

A simple, calm page (full Apple canon — cream bg, Cormorant heading):

Step 1: NPS slider (0–10) with end labels "Not great" / "Loved it".
  Sage drag handle. Sub-question on tap: "What's the main reason for
  your score?" (free-text, optional).
  Submit → save nps_score + nps_comment, status='responded'.

Step 2 (only if score >= 9):
  Heading "Help us share Astrabody."
  Body: "Would you leave us a quick Google review? It takes 10 seconds
  and we'll add a -15% voucher for your next session as a thank-you."
  Two buttons:
   - Primary "Leave a Google review" → opens
     tenant.google_business_review_url in a new tab, marks
     google_review_clicked=true, kicks off a 30-min later check
     (server-side cron) that:
       - If the client returns to /portal and we detect they came
         back, prompt "Did you post your review? [Yes / Not yet]"
       - If yes → mark google_review_confirmed_at, set
         clients.has_left_google_review=true, ISSUE the loyalty
         voucher (kind='percent', value_pct=tenant.review_bonus_voucher_pct,
         expires in 90 days, source='google_review')
   - Secondary "Maybe later" → status='dismissed'

Step 3 (if score < 9):
  Heading "Thank you for the honest answer."
  Body: "We'd love to hear what we could do better. Anything you share
  goes straight to {{tenant.owner_name}} and stays internal."
  Free-text + Submit. Save into nps_comment, send an internal email
  to the owner (not the client).
  EXPLICITLY do not push these clients to Google. This is the protect-
  reputation guardrail.

ADMIN UI — /admin/reviews:

Top KPIs:
- "Average NPS this month" + arrow vs last month
- "Google reviews requested" + "confirmed posted" + conversion %
- "Average response time" (request → first response)

Below: list of review_requests, latest first.
- Each row: client name, score (color-coded — sage for 9-10, neutral
  for 7-8, amber for ≤6), reason if dismissed, internal comment if
  there's one to read.
- Filter chips: "All / Promoters (9–10) / Passive (7–8) / Detractors
  (≤6) / No response yet".

ADMIN UI — /admin/settings → new "Reviews" tab:
- Field: "Google Business review URL" (paste the deep-link from your
  Google Business Profile dashboard — looks like
  https://g.page/r/<id>/review)
- Field: "Review bonus voucher (%)" (default 15)
- Toggle: "Pause review requests" (kills the trigger globally if the
  owner needs a quiet period)

UX guardrails:
- The NPS slider must give haptic-feel on mobile (CSS scale on tap).
- Never show the Google review CTA to a client who scored <9 — full
  stop. This is the single most important rule and the difference
  between a healthy review boost and a lawsuit waiting to happen.
- The voucher issuance happens server-side, atomically, and only after
  the client confirms "Yes, I posted". Don't give the voucher on the
  click of "Leave a Google review" — clients may abandon.
- The 90-day cooldown is hard. Even a milestone 10 doesn't override
  it. The cap is per-client per any-trigger.
- The owner's internal feedback email (for low scores) uses subject
  "Internal: NPS feedback from {{client.first_name}}" and goes to
  enquiries@astrabody.co.uk (or tenants.owner_email).
```

---

## PROMPT 11 — Digital products shop

```
Build a tiny in-portal shop where the clinic sells digital products
(PDFs, e-books, programme guides). Tenant 1 (Astrabody) sells the
Nutrition Blueprint at £19.99.

SCHEMA:

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  short_pitch text not null,           -- one-liner shown on the card
  long_description_md text,
  cover_url text,                       -- Supabase Storage public URL
  price_pence int not null,
  currency text not null default 'gbp',
  kind text not null check (kind in ('pdf','video','external_link')),
  asset_url text,                       -- private Storage path or external URL
  preview_url text,                     -- optional public thumbnail / sample page
  member_discount_pct int default 0,    -- e.g. 50 → Insider tier gets -50%
  free_for_tier text check (free_for_tier in ('insider','studio_insider')),
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.product_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  client_id uuid references clients(id),
  buyer_email text not null,
  amount_pence int not null,
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending','paid','refunded')),
  delivery_url text,                    -- one-time signed Storage URL valid 7d
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.product_downloads (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references product_purchases(id) on delete cascade,
  client_ip text,
  downloaded_at timestamptz not null default now()
);

Storage bucket "products-private" — RLS so signed URLs only.
Storage bucket "products-public" for covers and previews.

SEED for tenant 'astrabody':
- name: "Astrabody Nutrition Blueprint"
- short_pitch: "The 42-day eating protocol behind our Summer Sculpt
  cohort. 23 pages."
- price_pence: 1999
- kind: 'pdf'
- asset_url: products-private/astrabody/nutrition-blueprint-cohort.pdf
  (Nigel uploads via /admin once)
- preview_url: products-public/astrabody/nutrition-blueprint-cover.jpg
- member_discount_pct: 50  (Insider tier gets it for £9.99)
- free_for_tier: 'studio_insider'  (Studio Insider tier gets it free)

CLIENT UI — /portal/shop:

A clean grid (mobile: 1 column, tablet+: 2 columns).
Each product card:
- Cover image (16:9, sage placeholder if missing)
- Name (Cormorant 20px)
- Short pitch (Inter 13px, olive-soft)
- Price block:
  - Standard: "£19.99"
  - If client is Insider: strike-through £19.99, then "£9.99 with your
    Insider tier"
  - If client is Studio Insider: "Yours, free" (sage chip)
- CTA: "Get it" → /portal/shop/[slug]

Product page /portal/shop/[slug]:
- Cover + long description (markdown rendered)
- Sample preview (a thumbnail of page 1 if pdf, embedded video if video)
- Price + member tier discount logic
- Buy button → opens Stripe checkout (deferred PaymentIntent like the
  booking flow). On success, redirect to /portal/shop/orders/[purchaseId].

If the user is logged in and entitled (free_for_tier match), skip Stripe
entirely → instant fulfilment.

Order page /portal/shop/orders/[purchaseId]:
- "Your download is ready"
- Big sage button "Download PDF" → server-action that creates a fresh
  signed Storage URL valid 24h, redirects to it.
- "Available for 7 days. We'll keep your purchase on record forever."
- Insert a row in product_downloads each time the button is hit
  (audit trail).
- A small "Email me the link" link as a backup.

CHECKOUT FLOW — server actions:

createProductIntent(productId):
  - Validate active product
  - Compute final price (apply tier discount if logged in & client.tier
    matches, return free if free_for_tier matches)
  - If free: insert product_purchases row status='paid', delivered_at=now,
    return { free: true, purchaseId }
  - Else: create Stripe PaymentIntent metadata={purchase_id, kind:'product'},
    insert pending row, return { clientSecret, purchaseId }

confirmProductPayment(purchaseId, paymentIntentId):
  - Verify with Stripe (same as booking confirm)
  - Flip product_purchases.status='paid', set delivered_at=now
  - Generate the first signed URL, store in delivery_url

ADMIN UI — /admin/shop (new top-nav item between Reviews and Settings):

Tab 1 — "Catalog":
- List products. Click any → editor (cover upload, name, pitch, long
  description in markdown editor, price, kind, asset upload, member
  discount).
- "New product" button.

Tab 2 — "Sales":
- Table of product_purchases, latest first. Columns: date, product,
  buyer (linked to client if logged in, else email), amount, status.
- Click row → details + "Resend download link" button (rebuilds signed
  URL and emails it via Resend).

Tab 3 — "Stats":
- KPI cards: products sold this month, revenue, top product, average
  order value, conversion (visits to /portal/shop / purchases).

UX guardrails:
- No checkout step for free fulfilment — instant download.
- The download button on the order page must work on iOS Safari (test:
  signed URL with content-disposition=attachment).
- Cover images max 1MB, auto-resize on upload.
- Insider tier check is live-read against client.lifetime_points and
  the threshold from loyalty constants — no stale snapshot.
- The shop link in /portal bottom nav appears only if the tenant has at
  least one active product. Astrabody has one out of the box.

The Astrabody Nutrition Blueprint PDF lives at:
/Astrabody/Knowledge_Base/nutrition/03_protocol-cohort-edition_23p.pdf
Nigel will upload it manually via /admin/shop once the page is live.
The two shorter editions (8p lead magnet, 8p reply edition) are funnel
assets, not shop products — they live in the separate marketing flow.
```

---

## PROMPT 11.5 — Multi-resource per service + client reschedule

```
Add two related features:

1. Multi-resource per service. A service like InfraBike has multiple
   physical units (Bike 1 with adjustable pedals, Bike 2). Clients pick
   which unit they want. Two clients can book the same service at the
   same time on different units. Same staff can supervise both.

2. Client-side reschedule with cutoff. The client can move her own
   booking up to N hours before it starts (default 1h). After that,
   it's locked. Admin keeps full power, no cutoff.

SCHEMA:

create table if not exists public.service_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  name text not null,                  -- "Bike 1", "Bike 2", "Pad A"
  description text,                    -- "Adjustable pedals — best for tall or short clients"
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (service_id, name)
);

alter table public.bookings
  add column if not exists resource_id uuid references service_resources(id);
  -- Nullable: services without explicit resources still work normally.

alter table public.tenants
  add column if not exists reschedule_cutoff_hours int not null default 1;

SEED for Astrabody (idempotent on (service_id, name)):
- For service slug='infrabike':
  - "Bike 1" with description "Adjustable pedals — best for tall or short clients", sort_order=10
  - "Bike 2" with description null, sort_order=20
- Other services (EMS, Fat Freezing, Laser): no resources for now. Owner
  can add later via /admin/settings.

AVAILABILITY LOGIC — extend the slot picker computation:
- Today: a slot is busy if (working_hours block conflict) OR (existing
  bookings.staff_id collision) OR (GCal busy interval).
- New: if the chosen service has 1+ active resources AND the client
  picked a specific resource → also exclude slots where another
  bookings.resource_id already overlaps.
- If resource_id is "any" (not yet picked) → show union of all
  resource availabilities; the client picks resource at the next step.

API CHANGE — /api/availability:
- Accept optional &resourceId=<uuid>. If provided, filter overlap by
  that resource. If absent and service has resources, return slots
  where AT LEAST ONE resource is free, AND a list of which resources
  are free at each slot:
    [{ start: "2026-05-01T09:00:00Z", availableResources: [bike1id, bike2id] }, ...]

CLIENT BOOKING FLOW — /portal/book/[serviceId]:
- Existing steps: Service → Practitioner → Date/Time → Checkout.
- INSERT a new step between Practitioner and Date/Time IF the service
  has 2+ active resources:
    "Choose your equipment"
    Subtitle: "Each option is identical except where noted."
    Cards (mobile: stacked; tablet+: row of 3):
    - "Bike 1" + description "Adjustable pedals — best for tall or short clients"
    - "Bike 2"
    - "Any available" (default selected) — picks earliest free at booking time
- Selection persists via ?resource=<id> or ?resource=any in the URL.
- Slot picker (next step) filters availability accordingly.
- If a service has 1 resource → skip this step transparently and
  auto-attach that resource_id at booking creation time.
- If a service has 0 resources → no resource_id at all (current
  behaviour preserved).

BOOKING CREATION — createBookingAndIntent:
- Accept optional `resourceId` arg.
- If resource=any: at insertion time, pick the first free resource for
  that slot atomically inside a transaction (otherwise two simultaneous
  "any" bookings could collide on the same physical unit).
- Persist booking.resource_id.
- GCal event title: "{{service.name}} · {{resource.name}} · with {{staff}}"
  (e.g. "InfraBike · Bike 1 · with Nigel"). If no resource: just the
  current pattern.

DISPLAY EVERYWHERE:
- /portal home "Your next session" card: small label "InfraBike · Bike 1"
  if resource exists, else just "InfraBike".
- /portal/booking/[id]/confirmed: same.
- /admin/bookings list: sub-line shows " · Bike 1" appended to the
  service name when set.
- /admin/bookings detail Sheet: a "Resource" row.
- /portal/account upcoming sessions: same.

ADMIN UI — /admin/settings → new tab "Services" if not already there;
extend with a "Resources" sub-section per service:
- Per service: list of resources, "+ Add resource" button.
- Each row: name (text), description (text), is_active (toggle), drag
  to reorder, delete with confirmation.
- Validation: at least 0 or many; deleting a resource with future
  bookings prompts owner to migrate those bookings to another resource
  first.

CLIENT RESCHEDULE FLOW:

NEW PAGE — /portal/booking/[id]/reschedule:
- Server-gated: the booking must belong to the logged-in client AND
  be in status 'confirmed' AND start_at > now() + tenant.reschedule_cutoff_hours.
- If gate fails: render a calm message:
   - If too late: "Too late to reschedule." (one line, sage-soft, no
     other CTA)
   - If wrong booking / wrong status: "This booking can't be moved.
     [Back]"
- If gate passes:
   - Heading: "Move your session"
   - Sub: "Currently {{date}} at {{time}}. Pick a new slot below."
   - Mini-version of the slot picker (same service, same staff,
     same resource — locked, not changeable). Shows next 14 days, only
     open slots.
   - Tap a slot → confirmation modal: "Move to Friday 12 May at 4pm?"
     [Confirm] / [Cancel]
   - Confirm:
     1. UPDATE bookings.starts_at + ends_at + status='confirmed' (no
        change to other fields)
     2. Update the existing GCal event via events.patch (don't delete +
        recreate; preserves the event ID for the staff)
     3. If the booking was paying with a saved card / pack: nothing to
        do, money already booked
     4. Send email "rescheduled_by_client" template (seed one)
     5. Redirect to /portal/booking/[id]/confirmed with a `?moved=1`
        toast

ENTRY POINT:
- /portal/booking/[id]/confirmed: add a sage outline button
  "Reschedule" next to "Add to Google Calendar" — only visible if
  inside the cutoff window.
- /portal home "Your next session" card: a small chevron menu (•••) →
  Reschedule (if eligible) / Cancel (links to a future cancel UI).

EMAIL TEMPLATE (seed):
- slug 'rescheduled_by_client', trigger='manual' (called explicitly):
  Subject: "Your session has been moved"
  Body: warm UK English, mentions old time + new time + venue.

ADMIN SIDE:
- /admin/bookings booking detail Sheet: existing reschedule action
  unchanged. Admins can move any booking, anytime, no cutoff.
- An audit row in `bookings.notes` reads "Moved by client on {{date}}
  from {{old_starts_at}} to {{new_starts_at}}" each time the client
  reschedules. (Just append to notes; don't lose existing notes.)

UX guardrails:
- The client can reschedule as many times as she wants while in the
  cutoff window. No counter, no penalty (we want frictionless
  flexibility, that's the wedge vs Fresha).
- Resources without a specific "any available" option don't introduce
  surprise: if a tenant only has 1 resource per service, the entire
  resource step is invisible.
- Mobile-first: the resource cards stack on small screens with the
  description visible (no truncation).
- The "Choose your equipment" step uses the SAME card pattern as the
  practitioner picker for consistency. Re-use the existing component
  rather than building a new one.

Audit per the standing instructions: this prompt adds one new table
(`service_resources`) and one new column on `bookings` + one on
`tenants`. The new bookings.resource_id is nullable. The new FK from
service_resources to services should not ambiguate any existing embed
between bookings and services. Run typecheck + smoke the 16-route list
before stopping.
```

---

## PROMPT 12 — Notification system (bell + badges + auto-payroll)

```
Build a unified notification system across the admin side. The bell
top-right of AdminNav, badge count on individual nav items, and a
dropdown of recent activity. Plus the monthly auto-payroll calculation
that posts a notification on the 1st of each month so Nigel/Tove/Jade
see "your payroll is ready to export" the moment they open the dashboard.

SCHEMA:

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'monthly_payroll_ready',
    'noshow_charged',
    'noshow_charge_failed',
    'late_cancel_charged',
    'review_received',
    'google_review_posted',
    'coach_refreshed',
    'new_chat_message',
    'birthday_today',
    'pack_expiring_soon',
    'booking_confirmed',
    'booking_cancelled',
    'card_declined'
  )),
  title text not null,
  body text,
  action_url text,                     -- where the click takes them
  payload jsonb default '{}',           -- structured data (e.g. booking_id, amount)
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_unread_idx
  on notifications(recipient_user_id, created_at desc)
  where read_at is null;

RLS: a user can SELECT only her own notifications. INSERT/UPDATE
service-role only.

BELL UI — top-right of AdminNav:
- Sage bell icon (lucide-react: Bell). Apple-style.
- Red iOS badge `#FF3B30` with the unread count on top-right corner of
  the bell. Hides if count == 0.
- Tap → dropdown panel (320px wide, mobile fullscreen sheet):
  - Heading: "Notifications" + subtle "Mark all as read" link if any
    unread
  - List of latest 30 notifications, latest first
  - Each row: icon (per kind), title (sage-deep semibold 14px), body
    (olive-soft 13px, 2 lines max with ellipsis), relative time (12px,
    olive-faint, right-aligned)
  - Unread rows have a small sage dot on the left
  - Tap any row → mark read + navigate to action_url
  - Empty state: sage subtle "All caught up · No new notifications"

Use the 21st.dev notification component pattern as a reference but
adapt to our sage/cream palette. Bell uses `text-sage`, badge uses
`bg-[#FF3B30] text-white`.

NAV ITEM BADGES — extend AdminNav so each nav link can show a count:
- AdminNav reads ONE query at mount: `SELECT kind, count(*) FROM
  notifications WHERE recipient_user_id = $1 AND read_at IS NULL
  GROUP BY kind`
- Maps kind → nav item:
  - `new_chat_message` → Inbox
  - `monthly_payroll_ready` + future-month hits → Payroll
  - `review_received` + `google_review_posted` → Reviews
  - `noshow_charge_failed` + `card_declined` → Bookings (urgent)
- Badge style: same red iOS pill `#FF3B30`, smaller (16×16px), at the
  top-right of each nav item.

HOME BANNER — /admin home:
- If there is any unread notification with priority='urgent' OR kind in
  ('monthly_payroll_ready','noshow_charge_failed','card_declined'),
  show a sage-deep banner at the top of the page with:
  - icon, title, body, "Take me there →" button
- Tap the button → marks the notification read + navigates to
  action_url.
- Multiple banners stack (max 3 visible, "show more" expands).

NOTIFICATION TRIGGERS — wire into existing flows:

1. `markBookingCompleted` (existing in /admin/bookings/actions.ts):
   - After flipping status, INSERT a notification kind='booking_confirmed'
     for the staff (recipient = staff.user_id), with action_url=`/admin/bookings#${id}`
     — wait this is post-completion, change to title "Session with {{client}}
     marked as completed" — never mind, this trigger is too noisy. Skip.

2. After successful no-show charge (in markBookingNoShow):
   - INSERT notification kind='noshow_charged', priority='normal',
     recipient = the owner. title="Marie was charged £39 for missing
     today's session", action_url=`/admin/bookings#${id}`

3. On no-show charge failure:
   - INSERT kind='noshow_charge_failed', priority='urgent',
     title="Card charge failed for Marie's no-show — needs your action",
     body explains why (declined / requires_action / expired)

4. After successful late-cancel charge: same pattern, kind='late_cancel_charged'.

5. New chat message: when client sends a message, INSERT one notification
   per active staff (or just the assigned one if your model has one),
   kind='new_chat_message', action_url=`/admin/inbox?thread=${threadId}`.
   Throttle: collapse "5 messages from Lisa" into a single notification
   if multiple within 1h.

6. Review received (from Prompt 10 dispatch):
   - On NPS submit: kind='review_received', priority depends on score
     (urgent if ≤ 6, normal otherwise)
   - On Google review confirmed: kind='google_review_posted', body
     "Sophie left a 10/10 and posted on Google · +15% voucher issued"

7. Coach refreshed (Prompt 9.7): when /admin/finance generates new
   recommendations, kind='coach_refreshed', action_url=`/admin/finance`.

8. Birthday: when the email dispatcher sends a birthday email (Prompt 9.8),
   also INSERT kind='birthday_today' for the owner so they know to make
   a fuss in person.

9. Pack expiring: nightly cron checks client_packages where
   expires_at between now() and now() + 7d AND sessions_remaining > 0,
   creates ONE notification kind='pack_expiring_soon' per tenant per week
   (debounced, not per-pack), body "5 client packs expire this week".

MONTHLY AUTO-PAYROLL:

Server action `runMonthlyPayrollNotification(tenantId)`:
- Compute commissions where status='pending' AND created_at in last
  completed calendar month.
- Group by staff_id. Compute total per staff + global total.
- INSERT a notification per OWNER user of the tenant:
  - kind='monthly_payroll_ready'
  - priority='high'
  - title: "Your {{Month YYYY}} payroll is ready"
  - body: "£X owed across N staff. Tap to review and mark as paid."
  - action_url: `/admin/payroll?month=YYYY-MM`
  - payload: { month: 'YYYY-MM', total_pence: X, staff_count: N }

Wire to the email dispatcher (Prompt 9.8) so the owner ALSO gets an
email "Your March payroll is ready" with the same content. So whether
they open admin or check email, they see it.

CRON ENDPOINT — /api/cron/monthly-payroll:
- Protected by `CRON_SECRET` env header (Bearer auth).
- Iterates all tenants, calls `runMonthlyPayrollNotification` for each.
- Returns JSON `{ tenantsProcessed: N, notificationsCreated: M }`.

Vercel cron config — leave a TODO at the bottom of the file:

  // TODO: post-deploy, add to vercel.json:
  // {
  //   "crons": [
  //     { "path": "/api/cron/monthly-payroll", "schedule": "0 8 1 * *" }
  //   ]
  // }
  // Runs 1st of every month at 08:00 UTC.

INSTALL the 21st.dev notification dropdown component if it fits;
otherwise build a plain dropdown using shadcn Popover + a simple
list. Either way the visual must match Apple-style (cream background,
hairline borders, sage accents, red iOS badge).

UX guardrails:
- Marking a notification read updates immediately on click (optimistic
  UI), syncs to DB in background.
- Unread count never blocks UI — render fast, refresh in background.
- Empty state messaging is calm, not preachy ("All caught up", not
  "You have 0 notifications! Time to relax 🎉").
- Mobile: bell icon shows in the AdminNav header. Dropdown becomes
  full-screen sheet from the bottom (iOS pattern).
- Throttle/dedupe: never insert more than 1 notification of the same
  kind+payload within 60 seconds (to avoid loops or accidental
  multi-fires).
```

---

## PROMPT 13 — White-label & tenant onboarding wizard

```
Make the platform truly white-label. Each tenant gets their own brand
(logo, colours, fonts) and their own URL (subdomain or custom domain).
Plus a 5-minute onboarding wizard for Atavo to spin up new tenants.

SCHEMA:

alter table public.tenants
  add column if not exists slug_unique text generated always as (lower(slug)) stored,
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_hex text default '#5C6B4E',     -- sage
  add column if not exists brand_secondary_hex text default '#BBC4AA',   -- sage-light
  add column if not exists brand_background_hex text default '#F6F3EE',  -- cream
  add column if not exists brand_text_hex text default '#3E3E31',        -- olive
  add column if not exists brand_accent_hex text default '#758564',      -- sage-deep
  add column if not exists brand_font_heading text default 'Cormorant Garamond',
  add column if not exists brand_font_body text default 'Inter',
  add column if not exists subdomain text,                                -- e.g. 'astrabody' → astrabody.atavoplatform.com
  add column if not exists custom_domain text,                            -- e.g. 'app.astrabody.co.uk'
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists timezone text not null default 'Europe/London';

Storage bucket "tenant-logos" (public, max 2MB, image/* only).

DYNAMIC THEME INJECTION:

Today, sage / cream / olive are hardcoded in tailwind.config.ts and
globals.css as CSS custom properties. Refactor:

1. Move the colour vars to runtime CSS injection:
   - In `RootLayout`, fetch the current tenant (resolved by middleware
     from subdomain / custom domain) and inject a `<style>` block:
       :root {
         --primary: {{tenant.brand_primary_hex}};
         --primary-light: {{tenant.brand_secondary_hex}};
         --background: {{tenant.brand_background_hex}};
         --text: {{tenant.brand_text_hex}};
         --accent: {{tenant.brand_accent_hex}};
       }
   - Tailwind config reads from `var(--primary)` etc., so the colour
     tokens (`bg-primary`, `text-primary`) auto-pick up the tenant's
     palette.

2. Fonts via Google Fonts dynamic import:
   - Default to Cormorant + Inter.
   - If the tenant overrides, inject the right Google Fonts <link>
     tags. Limit to a curated allowlist of 6-8 known-good pairs to
     prevent accidental ugly typography.

3. Logo:
   - Header components (PortalHeader, AdminNav) read tenant.brand_logo_url.
     Falls back to tenant.name in Cormorant if no logo.

MIDDLEWARE — src/middleware.ts:
- Resolves the current tenant from the request's host header:
  - If host matches a tenant.custom_domain → use that tenant
  - Else if host is `<slug>.atavoplatform.com` → look up tenant by slug
  - Else (localhost or atavoplatform.com root) → use NEXT_PUBLIC_DEFAULT_TENANT_SLUG
- Stash the resolved tenantId in a request header `x-tenant-id` so
  every server component / action can read it from headers().
- For local dev: support `<slug>.localhost:3000` (e.g.
  `astrabody.localhost:3000`, `test-salon.localhost:3000`). Document
  in README that `/etc/hosts` needs entries for each test slug.

ONBOARDING WIZARD — /onboard (atavo super-admin only):

A 5-step wizard:
1. **Studio basics**: name, slug (validated unique), owner email,
   timezone (default Europe/London)
2. **Branding**: logo upload, primary colour picker, secondary, body
   font (dropdown of allowed pairs), live preview panel on the right
   showing the portal home with the tenant's brand
3. **Services**: pre-set catalogue templates (Wellness Studio /
   Aesthetics Clinic / Hair & Beauty / Custom). The owner can edit
   prices on the next page.
4. **Working hours**: copy-paste-style grid (Mon-Sun, time ranges).
   Default: 9-18 weekdays, 10-16 Saturday, closed Sunday.
5. **Done**: shows the tenant's URL (`<slug>.atavoplatform.com` or
   custom domain instructions), invitation email sent to owner, links
   to /admin.

The wizard is gated by an `is_atavo_admin` flag on auth.users
metadata. Only Nigel (and whoever he grants) can spin up new tenants.

After tenant creation:
- Insert tenants row with the wizard data
- Insert tenant_members for the owner (role='owner')
- Insert default services from the chosen template
- Insert default email templates (copy from astrabody seeds, swap
  {{tenant.name}})
- Insert default service_packages (3-4 starter packs they can edit)
- Send a welcome email to the owner with their /admin URL

ADMIN — /admin/settings/branding (new tab):
- Logo: upload + preview + remove
- Primary colour: hex input + color picker
- Secondary colour: same
- Background: same
- Body font: dropdown
- Heading font: dropdown
- Live preview panel shows a sample home page with current settings
- Save → updates tenants row, no need to redeploy (CSS vars apply on
  next page load)

ADMIN — /admin/settings → existing tabs renamed:
- Studio (was Tenant)
- Branding (NEW)
- Staff
- Services
- Cancellation policy
- Reviews
- Working hours
- Domain (new — see below)

ADMIN — /admin/settings/domain:
- Read-only field showing current subdomain
- Optional custom domain field with verification status
- Steps shown to user:
  1. Add this CNAME to your DNS: `cname-target-here`
  2. We'll verify within 1 hour. You'll get an email when ready.
- Vercel domain validation runs server-side via Vercel API (use
  VERCEL_TOKEN env var).

MULTI-TENANT BOUNDARIES — sanity check:
- Every existing query MUST filter by tenant_id (audit existing code,
  add eslint rule to flag selects without tenant filter where
  applicable).
- The middleware-injected tenantId is the SOURCE OF TRUTH. No tenant
  switcher visible to clients — they see only their own tenant by URL.
- Atavo super-admin can switch via /atavo/[tenantSlug] (separate
  surface, not built here).

UX guardrails:
- Brand colour pickers warn if contrast is too low (WCAG AA fail).
- Logo upload auto-resizes to max 512×512, keeps aspect ratio.
- Onboarding wizard saves progress at each step (resumable).
- Default brand stays sage/cream/olive — tenants only override what
  they want, the rest inherits Astrabody defaults.
- Per-tenant timezone: every "today's bookings" / "this month CA" / etc.
  query MUST use tenants.timezone, never hardcoded Europe/London.
  (Audit existing queries in this prompt; fix where needed.)
- Custom domain: the platform must work IDENTICALLY on the custom
  domain — no surprise redirects to atavoplatform.com.
```

---

## PROMPT 14 — Design polish pass (Apple Fitness+)

```
Polish the entire platform to Apple Fitness+ visual standards.
Read /docs/design-refs/REFERENCES.md for the canon. Apply across all
existing routes — this is a SWEEP, not a feature build.

SCOPE — touch every page, replace inline patterns with reusable
components, add micro-interactions, lift the visual bar.

REUSABLE COMPONENTS — refactor / consolidate:

1. **Toggle** — already created at @/components/ui/toggle.tsx. GREP
   the codebase for any inline toggle button (look for `role="switch"`)
   and replace with `<Toggle />`. There are at least 4-5 instances:
   /admin/emails template Active toggle, /admin/settings cancellation
   policy enable, /portal/book/[serviceId]/checkout "Apply rewards",
   /portal/book/[serviceId] "Use my pack", and any others found.

2. **EmptyState** — create @/components/ui/empty-state.tsx. Pattern:
   `<EmptyState icon={...} title="..." body="..." action={<Button>...</Button>} />`
   Apply on:
   - /admin/clients (no clients)
   - /admin/sales (no sales)
   - /admin/inbox (no conversations)
   - /admin/emails Campaigns (no campaigns)
   - /admin/loyalty (no members)
   - /admin/reviews (no reviews)
   - /portal/chat (no messages)
   - /portal/shop (no products) — already handled by hiding the link
   - /portal/account (no card on file already exists, just reuse)

3. **HeroCard** — create @/components/portal/hero-card.tsx. Apple
   Fitness+ pattern: full-width card, optional cover image with
   sage gradient overlay, big serif title, small subtitle, optional
   chip in top-right, optional CTA pill in bottom-right.
   Apply on:
   - /portal home: "Your next session" → upgrade to HeroCard with
     a sage gradient background (treatment photo placeholder), 32px
     Cormorant title showing the date, time + practitioner overlay
   - /portal/booking/[id]/confirmed: hero "You're booked." with
     sage gradient
   - /admin home: "Today's schedule" header → wrap in a HeroCard with
     today's date as the background motif

4. **StatCard** — create @/components/ui/stat-card.tsx for oversized
   number display. Pattern: small all-caps label (10px tracking-wide),
   big Cormorant number (42-48px), optional sublabel below.
   Apply on:
   - /admin home (3 stat cards)
   - /admin/finance (4 KPI cards)
   - /admin/me (3 earnings cards)
   - /admin/payroll (per-staff totals)
   - /admin/reviews (3 KPI cards)

MICRO-INTERACTIONS:

- All Buttons: scale 0.97 on active state (already in our Button
  variants? if not, add).
- All Cards that are tappable (booking rows, client rows, product
  cards): subtle lift on hover (translate-y -1px, shadow-2 → shadow-3)
  with 200ms ease-ios.
- Page transitions: when navigating between admin pages, a 250ms
  fade-in on the new page content (use Framer Motion or pure CSS).
  Don't block first paint.
- Tab switches in /admin/settings: cross-fade content area, not hard
  swap.
- Toggle: ALREADY iOS-style (don't touch).

LOADING STATES:

- Replace ALL spinning dots / Lucide RefreshCw spinning icons with
  shimmer placeholders. Pattern: a div the shape of the eventual
  content, sage-tint gradient animating left-to-right (CSS
  `@keyframes shimmer`).
- Apply to:
  - /admin/finance Coach card (already has shimmer per spec)
  - /portal home "Your next session" while bookings load
  - /admin/bookings list while data loads
  - /admin/clients table loading
- Never use a centered spinning circle. Always shimmer-shaped-like-the-
  content.

TYPOGRAPHY POLISH:

- All numbers in stats / prices / chart axes: use `font-variant-numeric:
  tabular-nums` (a Tailwind plugin or `tabular-nums` class). Already
  done in CheckoutSummary; sweep the rest.
- Headings (Cormorant) get a slight letter-spacing tighten:
  `tracking-tight` for h1, `tracking-tightest` for hero numbers.
- Body text never goes below 13px on mobile.

PHOTOGRAPHY PLACEHOLDERS:

- Until Astrabody commissions real photos (per /docs/design-refs/
  REFERENCES.md), use sage gradient placeholders for:
  - Practitioner cards (initials in sage circle — already implemented)
  - HeroCard backgrounds (linear-gradient sage-deep → sage-light →
    cream-deep, with a subtle treatment-icon SVG floating, low opacity)
  - Product cover (sage gradient with a subtle book/PDF icon)

- Provide a `<SagePlaceholder variant="treatment|product|portrait" />`
  component that renders these consistently.

NOTIFICATION POLISH:

- The bell icon from Prompt 12: ensure the badge animation pulses
  subtly when count > 0 (a CSS keyframe `pulse` 2s ease infinite,
  scale 1 → 1.08 → 1).
- Notification rows in the dropdown: have the small sage dot fade out
  when the row becomes read (with a 300ms transition).

ACCESSIBILITY SWEEP:

- All interactive elements must have `:focus-visible` rings (already
  hopefully done by shadcn).
- Color contrast: ensure all text passes WCAG AA on the cream
  background. Olive (#3E3E31) on cream (#F6F3EE) passes; sage
  (#5C6B4E) needs to be reserved for accents, not body text.
- Tap targets ≥ 44×44px on mobile.

DOCUMENTATION — update /docs/design-dna.md with the new components:
- Toggle (canonical)
- EmptyState
- HeroCard
- StatCard
- SagePlaceholder

This prompt is a SWEEP, not a feature build. Be ruthless about
consistency. After your changes, run typecheck + smoke the full route
list. Visual differences are the deliverable here.
```

---

## Order to run, and validation steps after each prompt

1. **Run 9.4** → bootstrap photos for Tove/Jade/Nigel via /admin/settings/staff. Verify the booking flow shows the practitioner step on /portal/book/[serviceId]. Make a test booking with each → confirm the slot picker respects each staff's calendar.
2. **Run 9.5** → seed yourself a -15% voucher manually via SQL (`insert into loyalty_vouchers ...`). Check it appears on /portal home wallet card. Try a checkout — verify the price breakdown computes correctly and the toggle restores full price.
3. **Run 9.6** → make a booking, mark completed, check that a commissions row was created. Visit /admin/me to see the earning row. Visit /admin/payroll, mark it paid.
4. **Run 9.6.5** → /admin/sales/new with a test client. Sell a "Pack 10 InfraBike" for £239, payment method = card terminal, sold by Tove. Verify: client_packages row created with sessions_remaining=10, commissions row created for Tove (£23.90 pending), client's /portal home now shows "Your packs" card. As the client, book an InfraBike → "Use my pack" toggle is on, checkout skips Stripe, booking confirms free. Reload portal → 9 sessions left.
5. **Run 9.7** → /admin/finance loads. Click "Refresh recommendations" → check the AI returns 3-5 sage cards. Export PDF for last month.
6. **Run 9.8** → /admin/emails loads with the seeded templates. Send a test welcome to yourself. Compose a campaign with the AI assist, send-test it.
7. **Run 9.9** → at the next checkout, tick "Save my card", pay with 4242 4242 4242 4242. Visit /portal/account → see the saved card. Then in /admin/bookings → mark that booking as no-show → verify the off-session charge succeeds (test in Stripe dashboard) and the booking flips to status='no_show'. Try with the SCA challenge card 4000 0027 6000 3184 to see the fallback flow.
8. **Run 10** → mark a booking as completed; the after_care email goes out 2h later (or trigger the cron manually for testing). Hit /portal/review/[id] yourself, score 10, click Google review CTA, confirm yes — verify a -15% voucher lands in your wallet (Prompt 9.5 surface).
9. **Run 11** → upload the Nutrition Blueprint PDF in /admin/shop. Buy it from /portal/shop with test card 4242 (use the saved card from Prompt 9.9 → one-tap purchase). Download. Verify the purchases row + product_downloads audit row.
10. **Run 11.5** → /admin/settings → Services tab → check that "Bike 1" and "Bike 2" appear under InfraBike. Book an InfraBike via /portal/book → verify the new "Choose your equipment" step appears. Pick Bike 1, complete booking. Make a 2nd booking at the SAME time slot → must be allowed since Bike 2 is free. Try a 3rd at the same time → must be blocked. Then test reschedule: open /portal/booking/[id]/confirmed → tap "Reschedule" → move to a new slot → verify the GCal event was patched (not recreated). Try rescheduling a booking starting in 30 min → should show "Too late to reschedule."
11. **Run 12** → bell icon top-right of AdminNav. Trigger a notification by marking a booking as completed (creates a "session completed" notification). Tap the bell → notifications dropdown shows it. Tap a notif → it marks as read and deep-links to the booking. Insert a fake "monthly_payroll_ready" notification via SQL → verify the banner appears on /admin home and the Payroll nav item shows a red badge.
12. **Run 13** → /onboard wizard → create a 2nd test tenant (slug: "test-salon", name: "Test Salon"). Visit test-salon.localhost:3000 (add to /etc/hosts: `127.0.0.1 test-salon.localhost`) → verify the test tenant's portal opens with default sage branding. /admin/settings/branding for test-salon → upload a different logo + change primary color to a different hex → reload the portal → verify the change applied without affecting Astrabody.
13. **Run 14** → visual sweep. Scroll through /portal home, /portal/book, /admin home, /admin/finance. The hero cards should now have sage gradients, the stat numbers should be oversized Cormorant, every toggle uses the canonical component, every empty state uses the agreed pattern, every loading shows a sage shimmer (not a spinner). Tap a button — it should scale-down 0.97 with the iOS easing curve.

Stop and ping me if anything blocks. Then we move on to multi-tenant
onboarding (Prompt 12 — first reseller tenant) once Astrabody itself
is live with this stack.

---

## PROMPT 16 — Bank holiday planner & universal client comms proposals

```
Two tightly related features:

A. Bank holiday planner — every year, the owner sees all upcoming UK
   bank holidays in the admin dashboard and decides whether to close.
   If they haven't decided 2 months out, the platform reminds them
   automatically. Once a closure is confirmed, the platform offers to
   email all affected clients.

B. Universal comms proposal — a design pattern woven throughout the
   entire admin. Any action with client impact (closure, price change,
   new hours, new service, promotion, flash slot…) ALWAYS surfaces a
   "Notify clients?" bar before the owner moves on. Not forced — one
   dismiss and it's gone — but always offered. The email is AI-drafted
   and ready to send in one tap.

─────────────────────────────────────────────
A. BANK HOLIDAY PLANNER
─────────────────────────────────────────────

SCHEMA:

create table if not exists public.bank_holiday_decisions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  date            date not null,
  name            text not null,          -- "Christmas Day", "Good Friday", etc.
  year            int not null generated always as (extract(year from date)::int) stored,
  decision        text not null default 'pending'
                    check (decision in ('pending', 'closed', 'open')),
  decided_at      timestamptz,
  decided_by_user_id uuid references auth.users(id),
  -- Tracking: has the 2-month reminder been sent?
  reminder_sent_at    timestamptz,
  -- Tracking: has the client announcement email been sent?
  client_email_sent_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (tenant_id, date)
);
create index bank_holiday_decisions_tenant_year_idx
  on bank_holiday_decisions(tenant_id, year, date);

RLS: SELECT for all tenant members; INSERT/UPDATE service-role or
owner/admin only.

UK BANK HOLIDAY ROSTER — hardcode 3 rolling years in
src/lib/coach/uk-calendar.ts (already exists for the AI coach; extend
it with a typed export):

export const UK_BANK_HOLIDAYS: { date: string; name: string }[] = [
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'Early May bank holiday' },
  { date: '2026-05-25', name: 'Spring bank holiday' },
  { date: '2026-08-31', name: 'Summer bank holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-05-03', name: 'Early May bank holiday' },
  { date: '2027-05-31', name: 'Spring bank holiday' },
  { date: '2027-08-30', name: 'Summer bank holiday' },
  { date: '2027-12-27', name: 'Christmas Day (substitute)' },
  { date: '2027-12-28', name: 'Boxing Day (substitute)' },
  // 2028
  { date: '2028-01-03', name: "New Year's Day (substitute)" },
  { date: '2028-04-14', name: 'Good Friday' },
  { date: '2028-04-17', name: 'Easter Monday' },
  { date: '2028-05-01', name: 'Early May bank holiday' },
  { date: '2028-05-29', name: 'Spring bank holiday' },
  { date: '2028-08-28', name: 'Summer bank holiday' },
  { date: '2028-12-25', name: 'Christmas Day' },
  { date: '2028-12-26', name: 'Boxing Day' },
];

SEEDING LOGIC — server action ensureBankHolidayDecisions(tenantId):
- Runs on every tenant's first daily cron tick (or on first admin login
  of the day, fire-and-forget).
- For each date in UK_BANK_HOLIDAYS that is in the future (> today):
  INSERT INTO bank_holiday_decisions (tenant_id, date, name, decision)
  VALUES (..., 'pending')
  ON CONFLICT (tenant_id, date) DO NOTHING;
- This is idempotent. Running it twice does nothing.

2-MONTH REMINDER CRON — extend /api/cron/monthly-payroll (or add a
dedicated /api/cron/bank-holiday-reminders):

Logic (runs daily at 08:00 UTC via Vercel cron):
  For each tenant:
    For each bank_holiday_decisions row where:
      - decision = 'pending'
      - date BETWEEN now() + 55 days AND now() + 65 days
      - reminder_sent_at IS NULL
    → INSERT notification kind='bank_holiday_reminder' (add this kind
      to the notifications check constraint in migration 017 via a new
      migration):
        title: "{{name}} is in {{N}} days — will you be open?"
        body: "You haven't set a closure for {{name}} ({{date}}).
               Tap to decide and optionally notify your clients."
        action_url: /admin/settings/schedule?highlight={{decision_id}}
        priority: 'high'
    → Also send an email to the owner (use the existing email dispatcher):
        subject: "Reminder: {{name}} is coming up — have you decided
                  your opening hours?"
        body: warm UK English, mentions the date, two CTA buttons:
              "Mark as closed" and "We'll be open" — both deep-link to
              the settings page with the decision pre-opened.
    → Set reminder_sent_at = now().

If the owner still hasn't decided 2 weeks before the bank holiday,
send a second, more urgent notification (priority='urgent',
title: "{{name}} is in {{N}} days — clients can still book!").

DECISION UI — /admin/settings → Schedule tab (built in Prompt 15):

Add a new sub-section above "Studio closures": "Bank holidays".

Displays a card per upcoming bank holiday for the current year,
sorted by date. Each card:
  - Date (day of week + DD Mon YYYY) in Cormorant 18px
  - Name of bank holiday in Inter 14px olive
  - Decision badge: "Pending" (sand chip) / "Closed" (sage chip) /
    "Open" (olive-soft chip)
  - Two quick-action buttons (only shown if decision='pending'):
    [ Close this day ]   [ Stay open ]
  - If decision='closed': "Added to calendar" sublabel + a small
    "Notify clients" pill (if client_email_sent_at is null).
  - If decision='open': muted, no action needed.

When owner clicks "Close this day":
  1. UPDATE bank_holiday_decisions.decision='closed', decided_at=now()
  2. INSERT into tenant_closures (reuse the table from Prompt 15):
     starts_on=date, ends_on=date, is_all_day=true, reason=name,
     source='bank_holiday' (add this value to the source check if not
     present, or store in reason).
  3. Show CommsProposalBar (see Part B below):
     "{{N}} clients have bookings around this period. Want to let
     everyone know you'll be closed on {{name}}?"

When owner clicks "Stay open":
  1. UPDATE decision='open', decided_at=now().
  2. No closure inserted. No email. Done.

ADMIN HOME BANNER — if any bank holiday has decision='pending' and
date < now() + 30 days, show an urgent HomeBanner (already built in
Prompt 12):
  Icon: calendar
  Title: "{{name}} is in {{N}} days — no decision yet"
  Body: "Set your opening hours now so clients know what to expect."
  CTA: "Decide now →" → /admin/settings/schedule

─────────────────────────────────────────────
B. UNIVERSAL CLIENT COMMS PROPOSALS
─────────────────────────────────────────────

DESIGN PRINCIPLE — this is a systemic pattern, not a one-off feature.
The rule is: any admin action that changes something a client would
care about MUST surface a CommsProposalBar offering to announce the
change by email. The owner can dismiss it with one tap. If dismissed,
it is never shown again for that specific event. But it is always
offered.

Actions that trigger a comms proposal:
  1. Adding a studio closure (any reason)
  2. Adding a bank holiday closure
  3. Changing working hours (temporary or permanent)
  4. Changing a service price (increase or decrease)
  5. Adding a new service to the catalogue
  6. Creating a flash slot (already exists in the booking flow)
  7. Launching a new package / changing a package price
  8. Adding a promotion or a double-points loyalty event
  9. Reopening after a previously-announced closure

SCHEMA — track dismissals to avoid re-showing:

create table if not exists public.comms_proposals (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  trigger_kind    text not null check (trigger_kind in (
    'studio_closure', 'bank_holiday_closure', 'working_hours_change',
    'service_price_change', 'new_service', 'flash_slot',
    'new_package', 'loyalty_promotion', 'studio_reopening'
  )),
  trigger_ref_id  uuid,                   -- the closure/service/package id
  trigger_summary text not null,          -- human-readable, e.g. "Closed Christmas Day"
  -- AI-generated email draft (cached, generated once on proposal creation):
  draft_subject   text,
  draft_body_md   text,
  -- Outcome:
  status          text not null default 'pending'
                    check (status in ('pending','sent','dismissed')),
  sent_at         timestamptz,
  dismissed_at    timestamptz,
  dismissed_by_user_id uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index comms_proposals_tenant_pending_idx
  on comms_proposals(tenant_id, status)
  where status = 'pending';

RLS: SELECT/UPDATE for owner/admin only; INSERT service-role only.

COMMS PROPOSAL BAR — reusable component
@/components/admin/CommsProposalBar.tsx:

A soft sage-tinted bar that slides in below the success toast after any
triggering action. Anatomy (mobile-first, stacks vertically below 600px):

  ┌──────────────────────────────────────────────────────┐
  │  ✉  Want to let your clients know?                   │
  │  "We'll be closed on Christmas Day (25 Dec)"         │
  │  Draft email ready · 847 clients                     │
  │                                                      │
  │  [ Preview & send ]           [ Dismiss ]            │
  └──────────────────────────────────────────────────────┘

- The bar is NOT a modal. It doesn't block anything. It sits below the
  action area and can be scrolled past.
- "Preview & send" opens a Sheet (not a new page). The sheet shows:
  - Segment selector: "All active clients" (default) / "Clients with
    bookings on that day" / "Clients booked for [service]" / custom
    segment from /admin/emails.
  - Live count: "This will go to {{N}} people."
  - AI-drafted subject + body (editable inline, markdown).
  - "Send now" / "Schedule" (date-time picker).
  - Small print: "Clients who have unsubscribed will not receive this."
- "Dismiss" → marks comms_proposals.status='dismissed',
  dismissed_at=now(). The bar disappears. It will not return for this
  specific event.

AI EMAIL DRAFT — server action generateCommsDraft(proposalId):
- Called once when the proposal is created (fire-and-forget after the
  triggering action succeeds). Stores the draft in comms_proposals so
  it is instant when the owner opens "Preview & send".
- Call claude-haiku-4-5 with:
    System: "You are a copywriter for {{tenant.name}}, a premium UK
    beauty/wellness studio. Write a short client-facing announcement
    email in UK English. Warm tone, contractions OK, no em-dashes,
    no marketing puffery. Max 80 words. Output JSON {subject, body_md}."
    User: "Announcement: {{trigger_summary}}. Studio name: {{tenant.name}}.
    Date context: {{today}}."
- Store draft_subject + draft_body_md on the proposal row.

WIRING THE COMMS PROPOSAL BAR into existing admin flows:

1. /admin/settings → Schedule → "Close this day" (studio closures,
   bank holidays):
   After INSERT into tenant_closures → INSERT comms_proposal
   trigger_kind='studio_closure' or 'bank_holiday_closure',
   trigger_summary="Closed on {{reason}} ({{date}})",
   trigger_ref_id=closure.id. Fire generateCommsDraft in background.
   Return proposal_id to client → client renders CommsProposalBar.

2. /admin/settings → Working Hours → any change:
   After UPDATE → INSERT comms_proposal trigger_kind='working_hours_change',
   trigger_summary="Opening hours updated: {{day}} now {{open}}–{{close}}".

3. /admin/settings → Services → price change:
   After UPDATE services.price_pence → INSERT comms_proposal
   trigger_kind='service_price_change',
   trigger_summary="{{service.name}} price updated to £{{new_price}}".
   NOTE: always show this for price increases. For decreases, it is
   even more valuable (clients love a deal announcement).

4. /admin/settings → Services → new service added:
   trigger_kind='new_service',
   trigger_summary="New service available: {{service.name}}".

5. /admin/bookings → Flash slot created (existing flow):
   trigger_kind='flash_slot',
   trigger_summary="Flash slot: {{service.name}} on {{date}} at {{time}},
   {{discount}}% off".
   The segment auto-selects "Clients who booked {{service.name}} in the
   last 6 months" as the default (they are the most likely to grab it).

6. /admin/settings → Packs → new pack or price change:
   trigger_kind='new_package',
   trigger_summary="New pack: {{pack.name}} at £{{price}}".

7. /admin/loyalty → Double points toggle switched ON:
   trigger_kind='loyalty_promotion',
   trigger_summary="Double points on {{service.name}} until {{end_date}}".
   Default segment: "All Inner Circle and Insider members".

PENDING PROPOSALS BADGE — /admin/emails nav item:
- If any comms_proposals rows with status='pending' exist, show the
  existing red badge on the Emails nav item with the count.
- /admin/emails → new tab "Pending announcements" (first tab, badge
  disappears once all are resolved):
    List of pending proposals: trigger summary, date created,
    estimated recipients, "Preview & send" / "Dismiss" buttons.
  This ensures proposals that were dismissed from the inline bar can
  still be found here within 7 days.

EXPIRY — if a proposal is not acted on within 7 days, auto-dismiss it
(a daily cron sets status='dismissed' for proposals older than 7 days
that are still pending). An expired proposal is never resurfaced.

GUARDRAILS:
- Never send an email without the owner clicking "Send now" or
  "Schedule". The proposal is always opt-in.
- The AI draft is a starting point, not the final email. The owner
  must be able to edit subject and body before sending.
- The segment count must be accurate. Pull it live when the Sheet
  opens (not when the proposal is created) so the number reflects
  unsubscribes since then.
- On mobile, the CommsProposalBar appears as a card at the top of the
  next screen the owner navigates to (not as a fixed overlay — that
  would cover the UI).
- The "Preview & send" sheet is a full-height Sheet (same shadcn Sheet
  used everywhere in the app) not a new page. Owner should be able to
  dismiss it and come back to it later via the Emails tab.

VALIDATION:
1. Add a bank holiday closure via the planner → CommsProposalBar
   appears below the success state. Click "Preview & send" → sheet
   opens with an AI-drafted closure announcement email. Edit the
   subject. Click "Send now" → verify email_broadcasts row created +
   email dispatched to segment.
2. Change an InfraBike price from £39 to £45 in settings → proposal
   bar appears. Click Dismiss → bar disappears. Go to /admin/emails →
   "Pending announcements" tab → the dismissed proposal is NOT there
   (it was dismissed, not pending).
3. Add a new flash slot → proposal bar defaults to "Clients who
   booked InfraBike in the last 6 months". Verify the segment count
   is correct.
4. Run the cron manually with a 7-day-old proposal → verify it is
   auto-dismissed.
5. On mobile (375px viewport): verify the CommsProposalBar stacks
   vertically and both buttons are ≥ 44px tap targets.
```

---

## PROMPT 15 — Staff time-off, studio closures & AI settings assistant

```
Two related features in one prompt:

A. Owner can manage staff holidays and studio-wide closures. When a
   staff member is on holiday, or the studio is closed, those dates
   become fully unavailable in the booking flow — no configuration
   needed by the client.

B. An AI natural-language assistant lives inside /admin/settings.
   The owner types what they want ("Tove is off 15–22 May", "We're
   closed on Christmas Day", "Change our Saturday hours to 9am–2pm")
   and the assistant shows a preview of the exact changes it will make
   before applying anything. Nothing is written to the DB without
   explicit confirmation.

─────────────────────────────────────────────
A. STAFF TIME-OFF & STUDIO CLOSURES
─────────────────────────────────────────────

SCHEMA:

create table if not exists public.staff_time_off (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  staff_id        uuid not null references staff(id) on delete cascade,
  starts_on       date not null,          -- inclusive, in tenant timezone
  ends_on         date not null,          -- inclusive
  reason          text,                   -- "Annual leave", "Sick", "Training", etc.
  is_all_day      boolean not null default true,
  -- For partial-day blocks (e.g. "Tove finishes at 1pm on Friday"):
  partial_start   time,                   -- null if is_all_day=true
  partial_end     time,                   -- null if is_all_day=true
  created_by_user_id uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (
    (is_all_day = true and partial_start is null and partial_end is null)
    or
    (is_all_day = false and partial_start is not null and partial_end is not null)
  )
);
create index staff_time_off_lookup_idx
  on staff_time_off(tenant_id, staff_id, starts_on, ends_on);

create table if not exists public.tenant_closures (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  starts_on       date not null,
  ends_on         date not null,
  reason          text,                   -- "Christmas", "Bank Holiday", "Refurb", etc.
  is_all_day      boolean not null default true,
  partial_start   time,
  partial_end     time,
  -- Optional override for a single service only (e.g. InfraBike maintenance):
  service_id      uuid references services(id) on delete cascade,
  -- null = entire studio closed; non-null = only that service unavailable
  created_by_user_id uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (
    (is_all_day = true and partial_start is null and partial_end is null)
    or
    (is_all_day = false and partial_start is not null and partial_end is not null)
  )
);
create index tenant_closures_lookup_idx
  on tenant_closures(tenant_id, starts_on, ends_on);

RLS:
- Both tables: SELECT for all tenant members; INSERT/UPDATE/DELETE for
  owner/admin only. Service-role bypasses.

AVAILABILITY LOGIC — extend /api/availability route and
createBookingAndIntent action:

When computing free slots for a given date range:

1. Load all staff_time_off rows for the requested staff where
   starts_on <= requested_date <= ends_on. If is_all_day=true → mark
   the entire day as busy for that staff. If is_all_day=false → treat
   partial_start..partial_end as a busy interval (same as a GCal block).

2. Load all tenant_closures rows where starts_on <= requested_date
   <= ends_on AND (service_id IS NULL OR service_id = requested_service).
   If is_all_day=true → mark all slots that day as unavailable regardless
   of staff. If is_all_day=false → mark the partial window as unavailable.

3. These checks happen BEFORE the GCal freebusy query. If the day is
   fully blocked by a closure, skip the GCal call entirely (saves quota).

4. In createBookingAndIntent: re-validate at write time (race-condition
   guard), fail with a clear error if the slot has become unavailable
   due to a newly-added closure.

SEED — UK Bank Holidays 2026 for tenant 'astrabody' (insert into
tenant_closures on first deploy, idempotent by reason + date):
- 2026-01-01 "New Year's Day"
- 2026-04-03 "Good Friday"
- 2026-04-06 "Easter Monday"
- 2026-05-04 "Early May bank holiday"
- 2026-05-25 "Spring bank holiday"
- 2026-08-31 "Summer bank holiday"
- 2026-12-25 "Christmas Day"
- 2026-12-26 "Boxing Day"
Owner can delete any of these if they choose to open on that day.

ADMIN UI — /admin/settings → new tab "Schedule":

Two sub-sections:

SUB-SECTION 1 — "Studio closures"

A mini calendar (react-day-picker or plain HTML month grid) showing:
- Existing closure days highlighted in olive/sand tint
- Bank holidays highlighted in sage-light
- Current month shown by default; prev/next month chevrons

"+ Add closure" button → bottom sheet (mobile) / popover (desktop):
- Date range picker (start date, end date — single day is start=end)
- All day toggle (on by default)
- If all day off: partial start time + end time inputs appear
- Service scope: "Entire studio" (default) or pick a specific service
- Reason (text input, optional but shown to staff)
- "Apply" → inserts into tenant_closures

Row list below the calendar: each closure as a row with date range,
reason, scope, and a delete button (owner-only). Soft warning if
there are existing bookings that overlap: "3 bookings on this day —
they will still show as confirmed but no new bookings will be accepted.
Consider messaging clients manually."

NOTE: this prompt deliberately does NOT auto-cancel or auto-message
overlapping bookings. That is a dangerous action that needs a separate
dedicated UI to review each client before notifying them. Leave a
comment: // TODO(post-launch): add "Notify affected clients" bulk
action here.

SUB-SECTION 2 — "Staff availability"

For each staff member (owner sees all; staff sees only themselves):
- A row showing name + role + "X days off this year"
- "+ Add time off" button → same sheet as studio closures but staff-
  scoped. Fields: date range, all-day toggle, partial hours if not all
  day, reason (dropdown: Annual leave / Sick / Training / Personal /
  Other — stored as free text so the label is human-readable).
- List of upcoming time-off blocks per staff, with delete button.
- If a partial-day block is added (e.g. "Tove finishes at 1pm on Friday
  2 May"), show a small orange dot on that day in the calendar
  indicating partial availability.

WORKING HOURS CHANGE — extend /admin/settings → "Working hours" tab
(already built in Prompt 13):
- Add a "Temporary override" button per day:
  "Override for a specific week" → pops a date-range picker + a single
  day's hours. Example: "22 Dec, open 10am–2pm only".
  This inserts a tenant_closures row with is_all_day=false,
  partial_start=14:00, partial_end=23:59 (i.e. closed from 2pm), with
  reason="Temporary reduced hours". A second row covers 00:00–10:00
  for the morning closure if open later than usual.
  (Simpler alternative: just store the override hours directly. Either
  approach is fine — pick whatever is cleanest with the existing
  working_hours schema.)

NOTIFICATIONS (extends Prompt 12):
- When a new studio closure is added and starts_on is within 7 days,
  INSERT a notification kind='booking_cancelled' (reuse the kind for
  urgency) → priority='high', title="Studio closed on {{date}} —
  {{N}} existing bookings may be affected", action_url=/admin/bookings.
  This alerts the owner to review and manually contact clients if
  needed.
- When a staff member adds their own time-off, notify all owners
  (kind='birthday_today' re-used as a proxy — or extend the kind
  enum with 'staff_time_off_added'). Title: "Tove is off 15–22 May".

─────────────────────────────────────────────
B. AI SETTINGS ASSISTANT
─────────────────────────────────────────────

An AI chat panel that lets the owner describe changes in plain English
and applies them after confirmation. Lives in /admin/settings as a
persistent side-panel (desktop) or bottom-sheet trigger (mobile).

SCHEMA:

create table if not exists public.settings_ai_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  user_message    text not null,
  assistant_plan  jsonb,                  -- the structured change plan returned
  was_confirmed   boolean,                -- null = pending, true = applied, false = rejected
  applied_at      timestamptz,
  created_at      timestamptz not null default now()
);
-- Audit trail only. Never read back by the assistant as conversation
-- history (each request is stateless to keep context clean).

RLS: SELECT/INSERT for owner/admin only.

AI SETTINGS ASSISTANT — server action interpretSettingsRequest(message):

1. Build the context object by reading the current tenant's settings:
   {
     workingHours: [...],          // from working_hours table
     staff: [...],                 // name, role, commission_rate
     services: [...],              // name, price, duration
     closures: [...],              // upcoming tenant_closures
     staffTimeOff: [...],          // upcoming staff_time_off
     cancellationPolicy: {...},
     reviewSettings: {...},
     timezone: "Europe/London"
   }

2. Call Claude (claude-haiku-4-5 for speed — owner expects <2s) with:

   System prompt:
   "You are a settings assistant for {{tenant.name}}, a premium UK
   beauty/wellness studio. The owner has asked you to make changes to
   their studio settings. Today is {{today}} (timezone:
   {{tenant.timezone}}).

   You will receive the current settings as JSON context and the
   owner's plain-English request. Your job is to produce a precise,
   structured change plan — nothing more. You must NOT invent prices,
   staff names, or services that are not in the context.

   Respond ONLY with a valid JSON object in this exact shape:
   {
     'summary': '<one sentence in UK English describing what will change>',
     'changes': [
       {
         'type': 'add_staff_time_off' | 'remove_staff_time_off' |
                 'add_tenant_closure' | 'remove_tenant_closure' |
                 'update_working_hours' | 'update_commission_rate' |
                 'update_service_price' | 'update_cancellation_policy' |
                 'update_review_settings',
         'description': '<plain English, one line>',
         'params': { ... }   // the exact parameters to write to the DB
       }
     ],
     'clarification_needed': null | '<question to ask the owner if ambiguous>'
   }

   If the request is ambiguous (e.g. 'close next Friday' when there are
   two Fridays in scope), set clarification_needed instead of guessing.
   If the request references a person not in the staff list, set
   clarification_needed.
   If the request asks for something outside these change types (e.g.
   'delete all our clients'), set changes=[] and summary='I can only
   manage schedule and settings — I cannot do that.'
   "

   User message: the owner's plain-English request + the context JSON.

3. Parse the response. If clarification_needed is set, return it to the
   UI as a follow-up question — do not apply anything.

4. Return the plan to the client. The UI renders it as a confirmation
   card. Owner clicks "Apply" → applySettingsChanges(planId) writes
   to the DB and logs the confirmed row in settings_ai_log.

SUPPORTED CHANGE TYPES and their DB writes:

- add_staff_time_off → INSERT into staff_time_off
  params: { staff_id, starts_on, ends_on, is_all_day, partial_start?,
            partial_end?, reason }

- remove_staff_time_off → DELETE from staff_time_off by id
  params: { time_off_id }

- add_tenant_closure → INSERT into tenant_closures
  params: { starts_on, ends_on, is_all_day, partial_start?,
            partial_end?, reason, service_id? }

- remove_tenant_closure → DELETE from tenant_closures by id
  params: { closure_id }

- update_working_hours → UPDATE working_hours for a specific day
  params: { day_of_week (0-6), open_time, close_time, is_closed }

- update_commission_rate → UPDATE staff.commission_rate_pct
  params: { staff_id, new_rate_pct }

- update_service_price → UPDATE services.price_pence
  params: { service_id, new_price_pence }
  NOTE: this MUST show a warning in the UI: "This will affect all
  future bookings. Existing confirmed bookings keep their original
  price."

- update_cancellation_policy → UPDATE tenants cancellation columns
  params: { noshow_charge_pct?, late_cancel_charge_pct?,
            late_cancel_cutoff_hours?, cancellation_policy_text? }

- update_review_settings → UPDATE tenants review columns
  params: { google_business_review_url?, review_bonus_voucher_pct? }

ADMIN UI — /admin/settings → persistent "Ask AI" entry point:

Desktop: a small sage pill button "Ask AI ✦" fixed to the bottom-right
of the settings area (not the entire screen — scoped to the settings
layout). Clicking it opens a 380px side drawer that slides in from the
right, pushing the settings content slightly left. The drawer stays
open as the owner navigates between settings tabs.

Mobile: a floating sage circle button (48px, bottom-right, above the
bottom nav) with a small sparkle icon. Tapping opens a full-screen
bottom sheet.

CHAT UI inside the drawer/sheet:

- Heading: "Settings assistant" (Cormorant 20px) + close button
- Sub: "Describe any change and I'll preview it before applying."
- Message input (bottom-pinned, full-width, rounded): placeholder
  "e.g. Tove is off from 15 to 22 May"
- Send button: sage circle with arrow icon, 44px tap target
- Conversation area above: shows messages + AI responses

Message flow:
1. Owner types: "Tove is off from 15 to 22 May for annual leave"
2. Thinking indicator (3 sage dots pulsing)
3. Assistant responds with a confirmation card:
   ┌──────────────────────────────────────────┐
   │ ✦  Preview of changes                    │
   │                                          │
   │ Add 8 days of time off for Tove          │
   │ 15 May 2026 – 22 May 2026               │
   │ Reason: Annual leave                     │
   │                                          │
   │ Slots for Tove will be hidden from       │
   │ the booking page on those dates.         │
   │                                          │
   │  [ Apply ]   [ Cancel ]                  │
   └──────────────────────────────────────────┘
4. Owner taps "Apply" → changes written, card updates to:
   "Done. Tove's calendar is blocked 15–22 May."
5. Owner taps "Cancel" → card becomes muted, logged as rejected.

If clarification is needed:
- Assistant asks the question as a normal chat bubble.
- Owner answers → the original message + clarification are sent
  together in the next interpretSettingsRequest call.

EXAMPLE INPUTS the assistant must handle correctly:

- "Close the studio on Christmas Day" → add_tenant_closure for
  2026-12-25, is_all_day=true, reason="Christmas Day"
- "We're closing at 3pm on Saturday 28 November" → add_tenant_closure
  for 2026-11-28, is_all_day=false, partial_start=15:00,
  partial_end=23:59, reason="Early close"
- "Change Saturday hours to 9am to 2pm" → update_working_hours
  day_of_week=6, open_time=09:00, close_time=14:00
- "Jade is taking the week of 9 June off" → add_staff_time_off
  starts_on=2026-06-09, ends_on=2026-06-13, staff=Jade, is_all_day=true
- "Tove finishes early at 1pm this coming Friday" → add_staff_time_off
  is_all_day=false, partial_start=13:00, partial_end=23:59, single day
- "Increase Tove's commission to 12%" → update_commission_rate
  staff=Tove, new_rate_pct=12.00
- "The InfraBike is being serviced on 10 June — no bookings" →
  add_tenant_closure starts_on=2026-06-10, service_id=<infrabike uuid>
  reason="Equipment maintenance"
- "What are our opening hours?" → this is NOT a change request. The
  assistant replies with the current working hours in plain English
  (read from context) without producing a change plan. No DB write.

GUARDRAILS:

- NEVER apply a change without the owner explicitly clicking "Apply".
  The two-step preview-then-confirm is non-negotiable.
- NEVER invent a staff member or service that is not in the context.
  Return clarification_needed instead.
- NEVER accept free-form instructions that could delete clients,
  bookings, or financial records. Those change types simply don't exist
  in the allowed list.
- Cap the AI response at 800 tokens (no need for verbosity — it's a
  structured JSON plan).
- Log every request in settings_ai_log, confirmed or not. The owner
  can audit "who changed what via AI" from the log if needed (surface
  this in /admin/settings as a small "Recent AI changes" link — just a
  table of the log, no action needed).
- Rate-limit to 30 requests per tenant per hour (return a friendly
  message if exceeded: "Slow down — you can make 30 changes per hour
  via the assistant.").

VALIDATION — run after this prompt ships:
1. Manually add Tove as off 15–22 May via the UI calendar form.
   Book an InfraBike → verify Tove does NOT appear in the practitioner
   picker on those dates. Book on 14 May → Tove appears normally.
2. Add a studio closure for 25 Dec. Go to /portal/book → try to book
   on 25 Dec → no slots available. Try 26 Dec → normal.
3. Add an InfraBike-only closure on a specific day. Book EMS on the
   same day → works. Book InfraBike → no slots.
4. Open the AI assistant. Type "Tove is off next Monday". Assistant
   should ask for the year/date since "next Monday" is relative —
   verify it asks for clarification, doesn't guess.
5. Type "Close the studio on 3 June for a team away day". Verify the
   plan card shows the right closure. Click Apply. Check tenant_closures
   table. Check /portal/book on 3 June → no slots.
6. Type "What days is Jade off this month?" → assistant reads context
   and answers in plain English. No change plan rendered.
7. Check settings_ai_log for all the above → all requests logged with
   was_confirmed column correctly set.
```

---

## PROMPT 17 — Gift Cards + Client Referral Programme

```
Add two client-growth features to the platform: (1) e-gift cards that
clients can purchase and send to friends, (2) a referral programme
where existing clients earn credit when they bring someone new.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — E-GIFT CARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEMA — new table public.gift_cards:
  id                uuid primary key default uuid_generate_v4()
  tenant_id         uuid not null references public.tenants(id) on delete cascade
  code              text not null unique  -- 12-char uppercase alphanumeric, auto-generated
  initial_pence     int not null          -- original value
  balance_pence     int not null          -- remaining (decrements on redemption)
  purchased_by      uuid references public.clients(id) on delete set null
  recipient_email   text                  -- where the gift email was sent
  recipient_name    text
  personal_message  text                  -- optional message from buyer
  stripe_payment_intent_id text           -- proof of payment
  redeemed_by       uuid references public.clients(id) on delete set null
  redeemed_at       timestamptz
  expires_at        timestamptz not null default (now() + interval '12 months')
  created_at        timestamptz not null default now()
  check (balance_pence >= 0)
  check (balance_pence <= initial_pence)

RLS:
- SELECT: tenant owners/admins see all; clients see their own (purchased_by = auth uid
  OR redeemed_by = auth uid).
- INSERT: service-role only (triggered from the Stripe webhook / purchase action).
- UPDATE (balance + redeemed_by + redeemed_at): service-role only.

INDEX: (tenant_id, code) for fast redemption lookups.
INDEX: (tenant_id, expires_at) where balance_pence > 0 for expiry cron.

PURCHASE FLOW (/portal/shop — new "Gift a Session" card):

The shop already exists. Add a new product card:
  - Heading: "Gift a Session"
  - Sub: "Treat someone to the Astrabody experience."
  - A horizontal row of denomination buttons: £39 · £80 · £160 · Custom
    Custom = a number input (£20 min, £500 max, multiples of 1).
  - Fields: Recipient name, Recipient email, Personal message (optional,
    max 200 chars, textarea).
  - "Add to gift bag" button (sage) → Stripe Checkout (one-time payment,
    same pattern as digital products in /portal/shop).

On Stripe webhook (payment_intent.succeeded):
  - Insert gift_cards row with generated code, initial_pence, recipient_email.
  - Send a beautiful HTML email via Resend to recipient_email:
    Subject: "{buyer_name} has sent you a gift from Astrabody 🌿"
    Body: studio name, gift value, unique code in large Cormorant serif,
    expiry date, CTA button "Book your session →" pointing to /portal/book.
    Keep Astrabody cream/sage palette. No corporate footer.
  - Send a confirmation email to the buyer:
    "Your gift has been sent to {recipient_name}. They'll receive it shortly."

REDEMPTION (at /portal/book checkout):
  - Add a "Have a gift card?" collapsible row above the Pay button
    (same pattern as loyalty points / voucher redemption already in checkout).
  - Client enters code → server action validateGiftCard(code, tenantId):
    - Checks code exists, tenant matches, not expired, balance > 0.
    - Returns { valid: true, balancePence, expiresAt } or { valid: false, reason }.
  - If valid: deduct min(balancePence, bookingPrice) from the card balance.
    Apply the remainder to Stripe charge (or skip Stripe entirely if card
    covers the full amount).
  - On booking confirmed: update gift_cards.balance_pence, set
    redeemed_by / redeemed_at if balance reaches 0.
  - Partial redemptions are allowed (e.g. £80 card used against a £39
    booking → £41 remains on the card for next time).

ADMIN — /admin/settings → new "Gift Cards" tab:
  - Table: Code · Value · Balance · Recipient · Sent · Expires · Status
    (Active / Redeemed / Expired).
  - Search by code or recipient email.
  - "Void" action (owner only): sets balance_pence = 0.
  - "Issue manual gift card" button: owner can create a card without
    payment (for compensation / goodwill). Amount + recipient required.
  - Expiry cron TODO comment (auto-expire cards past expires_at,
    notify recipient 7 days before expiry).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — REFERRAL PROGRAMME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEMA — new table public.referrals:
  id                uuid primary key default uuid_generate_v4()
  tenant_id         uuid not null references public.tenants(id) on delete cascade
  referrer_client_id uuid not null references public.clients(id) on delete cascade
  referred_client_id uuid references public.clients(id) on delete set null
  referral_code     text not null unique  -- 8-char, e.g. "JADE8K2P"
  status            text not null default 'pending'
    check (status in ('pending','converted','rewarded'))
  converted_at      timestamptz   -- when the referred client completed their first booking
  rewarded_at       timestamptz   -- when the referrer received their credit
  referrer_credit_pence int not null default 1000  -- £10 default
  referred_credit_pence int not null default 1000  -- £10 default (as loyalty points)
  created_at        timestamptz not null default now()

Each client gets exactly one referral_code (generate on first portal login if
not already present). Store on public.clients.referral_code text unique.

REFERRAL FLOW:

1. Client shares their link: https://{studio_domain}/portal/book?ref=JADE8K2P
2. New visitor clicks the link → /portal/book stores the ref code in a
   session cookie (referral_code, max-age 7 days).
3. New visitor signs up / books → on first booking confirmed:
   - Look up the referral_code cookie.
   - If found and valid (referrer exists, not self-referral):
     INSERT into referrals with status='pending'.
     Award referred_client_id loyalty points (referred_credit_pence / 10 pts,
     using existing loyalty_ledger with reason='referral_welcome').
     Mark status='converted'.
4. After the referred client's first booking is marked completed:
   - Update referrals.status = 'rewarded', set rewarded_at.
   - Credit the referrer loyalty_ledger: referrer_credit_pence / 10 pts,
     reason='referral_earned', display_label='You referred a friend — thanks!'.
   - Send the referrer a WhatsApp/email:
     "Your friend {first_name} just completed their first session.
      We've added £10 credit to your account. Thank you for spreading
      the word! 🌿"

CLIENT PORTAL — /portal/me → new "Refer a Friend" section:

Below the loyalty wallet. Show:
  - "Invite a friend, both get £10 in credit"
  - Their unique link with a copy-to-clipboard button
  - A share-via-WhatsApp button (wa.me link pre-filled with the message:
    "I've been going to Astrabody in Chandler's Ford — you'd love it.
     Use my link to book and we both get £10 credit: {link}")
  - Small history: "You've referred N friends · N converted · £X earned"

ADMIN — /admin/clients → client profile drawer → new "Referrals" tab:
  - Shows how many they've referred, total credit earned, pending vs rewarded.
  - Owner can manually mark a referral as rewarded if needed.

SETTINGS — /admin/settings → new "Referral" section (inside the existing
Loyalty tab):
  - Toggle: Enable referral programme (default off).
  - Referrer reward amount (£, default £10).
  - Referred reward amount (£, default £10).
  - Min booking value to qualify (£, default £0 — any booking counts).

MIGRATION — one new migration for gift_cards + referrals tables.
Add referral_code text unique column to public.clients.

VALIDATION:
1. Purchase a £39 gift card → check email arrives at recipient address.
   Check gift_cards row in DB. Check Stripe payment in dashboard.
2. Use the gift card code at checkout → balance decrements correctly.
   Partial redemption (£80 card on £39 booking) → £41 remains.
3. Generate a referral link. Open it in incognito. Complete a booking.
   Check referrals row inserted with status=converted.
   Mark that booking completed → referrals.status=rewarded, loyalty
   ledger has two new rows (referred + referrer).
4. Admin Gift Cards tab shows the card. Void it → balance = 0.
   Try to use the voided code at checkout → rejected.
```

---

## PROMPT 18 — Waitlist + "Book Again"

```
Two small but high-impact client-facing features: a waitlist system
for full slots, and a one-tap "Book again" shortcut in the client portal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — WAITLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEMA — new table public.waitlist_entries:
  id                uuid primary key default uuid_generate_v4()
  tenant_id         uuid not null references public.tenants(id) on delete cascade
  client_id         uuid not null references public.clients(id) on delete cascade
  service_id        uuid not null references public.services(id) on delete cascade
  staff_id          uuid references public.staff(id) on delete set null
    -- null = "any practitioner"
  preferred_date    date not null
  preferred_window  text check (preferred_window in ('morning','afternoon','evening','any'))
    default 'any'
  notified_at       timestamptz   -- when we pinged them about an opening
  expires_at        timestamptz not null default (now() + interval '30 days')
  created_at        timestamptz not null default now()

RLS:
  SELECT: client sees own rows; owner/admin sees all for tenant.
  INSERT: authenticated client for their own tenant.
  DELETE: client deletes own; owner/admin deletes any.

INDEX: (tenant_id, service_id, preferred_date) for fast slot-opening lookups.

CLIENT BOOKING FLOW — when no slots are available on a chosen date:

Currently the SlotPicker shows an empty state. Replace it with:
  "No availability on this date.
   [Join the waitlist — we'll message you as soon as a slot opens]"
  (sage ghost button, full-width on mobile)

Tapping opens a small bottom sheet:
  - "We'll let you know the moment a slot opens up."
  - Pre-filled: service name, date chosen.
  - Optional: preferred time of day (Morning / Afternoon / Evening / Any time).
  - Optional: specific practitioner or "Anyone available".
  - "Add me to the waitlist" (sage filled button).
  - On confirm → INSERT waitlist_entries row. Toast: "You're on the list.
    We'll message you on WhatsApp if a slot opens."

TRIGGER — when a slot opens (booking cancelled or staff time-off removed):
  In cancelBooking() and in the remove_staff_time_off action handler:
  After the status flip / deletion, fire a fire-and-forget async function
  notifyWaitlistForSlot(tenantId, serviceId, freedDate):
    1. Query waitlist_entries where service_id matches, preferred_date =
       freedDate (or within ±1 day if none exact), not yet notified,
       not expired. Order by created_at ASC (first in, first notified).
    2. For the first matching entry (notify one at a time to avoid
       overbooking):
       - Send a WhatsApp message via the existing WhatsApp client:
         "Great news — a {service_name} slot has just opened on
          {date} at Astrabody. Book it before it goes:
          {booking_link}  🌿"
       - Set notified_at = now() on the entry.
    3. If the slot is still unclaimed after 2 hours (a cron TODO comment —
       like the others), notify the next entry in the list.

ADMIN — /admin/bookings → new "Waitlist" tab:
  Table: Client · Service · Date · Window · Practitioner · Added · Status
  (Waiting / Notified / Expired). Owner can delete entries. Export to CSV.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — "BOOK AGAIN" SHORTCUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In /portal/me, the client already sees their booking history.

Add a "Book again" pill button (sage ghost, 36px height) next to each
past booking row. Tapping it navigates to:
  /portal/book/{serviceId}?staff={staffId}&source=book_again

In the booking flow:
  - Pre-select the same staff member (if still active).
  - Skip the practitioner picker step (go straight to date/time).
  - Show a subtle hint at the top: "Booking with {staff_name} again —
    tap to change" (links back to the practitioner step).

Also add a "Your usual" section at the TOP of /portal/book (the service
picker page) if the client has 2+ completed bookings of the same service:
  ┌──────────────────────────────────────────┐
  │  Your usual                              │
  │  InfraBike · 30 min · £39              │
  │  Last with Tove · 3 weeks ago           │
  │  [Book again →]                          │
  └──────────────────────────────────────────┘
  (Cormorant 18px heading, sage arrow CTA, cream card with hairline border)

MIGRATION — one new migration for waitlist_entries table.

VALIDATION:
1. Fill all slots for a service on a specific date. Go to /portal/book →
   choose that date → see the "No availability" + waitlist CTA.
   Join the waitlist. Check waitlist_entries row in DB.
2. Cancel one of the bookings on that date. Verify the waitlist client
   receives a WhatsApp notification (check the message in the admin inbox).
   Check notified_at is set.
3. Go to /portal/me → find a past booking → tap "Book again" → verify
   staff is pre-selected, practitioner step is skipped.
4. Book the same service 2+ times → go to /portal/book → "Your usual"
   section appears at the top with the last service + staff.
```

---

## PROMPT 19 — Pre-appointment Intake Forms

```
Add digital intake / consultation forms that the admin configures per
service. Clients receive a link 24 hours before their appointment,
fill it in on their phone, and the admin sees the answers in the
booking detail view.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

public.intake_forms — templates defined by the admin:
  id            uuid primary key default uuid_generate_v4()
  tenant_id     uuid not null references public.tenants(id) on delete cascade
  name          text not null          -- e.g. "Fat Freezing Health Check"
  service_ids   uuid[]                 -- which services trigger this form
  fields        jsonb not null         -- ordered array of field definitions (see below)
  is_active     boolean not null default true
  created_at    timestamptz not null default now()

Field definition shape (each element of fields[]):
  {
    "id": "uuid-v4",
    "type": "text" | "textarea" | "yes_no" | "multiple_choice" | "signature",
    "label": "Do you have any cardiovascular conditions?",
    "required": true,
    "options": ["Yes","No"]    // only for multiple_choice
  }

public.intake_responses — one row per booking:
  id              uuid primary key default uuid_generate_v4()
  tenant_id       uuid not null references public.tenants(id) on delete cascade
  booking_id      uuid not null unique references public.bookings(id) on delete cascade
  form_id         uuid not null references public.intake_forms(id) on delete cascade
  client_id       uuid not null references public.clients(id) on delete cascade
  answers         jsonb not null  -- { "field_id": "answer_value", ... }
  submitted_at    timestamptz
  token           text not null unique  -- secure random 32-char token for the public link
  expires_at      timestamptz not null default (now() + interval '48 hours')
  created_at      timestamptz not null default now()

RLS:
  intake_forms: SELECT / ALL for owner/admin of tenant.
  intake_responses: SELECT for owner/admin; UPDATE (submit) via public route
    using token (no auth required — client fills via token link).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORM BUILDER — /admin/settings → new "Intake Forms" tab
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

List of existing forms (name, linked services, active toggle).
"New form" button → opens a full-page form builder:

  - Form name field (e.g. "Fat Freezing Health Check")
  - "Attach to services" multi-select (uses existing services list)
  - Field list with drag-to-reorder (dnd-kit, already in the project or
    use a simple up/down arrow approach if dnd-kit not installed)
  - "Add field" button → inline field editor:
      - Field type selector (Text / Long text / Yes/No / Multiple choice /
        Signature)
      - Label input
      - Required toggle
      - For Multiple choice: option list (add/remove options)
  - "Save form" → upserts intake_forms row

PRE-BUILT TEMPLATES (show when creating a new form):
  Admin can pick a template to pre-populate the builder:
  - "Fat Freezing — Standard Health Check" (10 yes/no questions about
    cardiovascular health, pregnancy, implants, pacemaker, skin conditions,
    recent surgery)
  - "Laser Hair Removal — Skin Assessment" (Fitzpatrick type, recent
    tanning, medications, previous laser, skin sensitivity)
  - "EMS Body Sculpting — Fitness Baseline" (muscle conditions, implants,
    recent injury, fitness level)
  - "General Wellness — Intake" (5 open questions: goals, health concerns,
    previous treatments, allergies, anything else we should know)
  These are hardcoded JSON arrays in src/lib/forms/intake-templates.ts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEND FLOW — 24h before the appointment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the booking confirmation flow (when a booking is created):
  - Check if the booked service has an active intake form.
  - If yes: INSERT intake_responses row with a generated token,
    expires_at = appointment_time + 2h (so they can still fill it
    in last minute).
  - Schedule a reminder at appointment_time - 24h to send the form link.
    Use the same TODO cron pattern as the others:
    /api/cron/intake-form-reminders/route.ts
    Queries bookings where starts_at BETWEEN now()+23h AND now()+25h,
    has an intake_responses row with submitted_at IS NULL,
    sends a WhatsApp + email with the form link.
  - The form link: /intake/{token} (public, no auth needed).

If the form is still unsubmitted at appointment time:
  - Show a yellow banner in the admin booking detail: "Client hasn't
    completed their intake form yet."
  - Admin can resend the link manually from that banner.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT FORM PAGE — /intake/[token] (public route, no auth)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Standalone page, no nav, no portal chrome. Just:
  - Studio logo + name (from tenant branding)
  - Heading: "Before your {service_name} on {date}" (Cormorant 28px)
  - Sub: "Please take 2 minutes to complete this health form."
  - Form fields rendered from the template (all mobile-optimised,
    44px min tap targets for yes/no buttons)
  - Signature field: use a simple canvas-based signature pad
    (signature_pad npm package — lightweight, no dependencies)
    stored as a base64 PNG in the answers JSON.
  - "Submit" button (sage, full-width) → POST to
    /api/intake/[token]/submit:
    - Validates token exists, not expired, matches tenant.
    - Validates required fields are present.
    - Updates intake_responses: answers + submitted_at = now().
    - Returns 200.
  - Success state: "Thank you! We look forward to seeing you on {date}.
    See you at Astrabody. 🌿" with the studio address.
  - Error: expired token → "This form has expired. Please ask the
    studio to resend it." with the studio phone number.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADMIN — booking detail view
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the booking detail drawer (/admin/bookings), add an "Intake form"
section:
  - If no form linked: nothing shown.
  - If form sent, not submitted: amber pill "Awaiting response" +
    "Resend link" button.
  - If submitted: green pill "Completed · {relative time}" +
    "View answers" button → expands inline showing each question +
    answer. Signature renders as an <img> tag from the base64.
  - "Download PDF" button → generates a simple print-ready PDF of the
    answers (use the existing pdf skill pattern — html-pdf-node or
    similar).

Client profile (/admin/clients → client drawer) → "Forms" tab:
  All intake responses for this client across all bookings. Sorted by
  date desc. "View" expands each one inline.

MIGRATION — one new migration for intake_forms + intake_responses.

VALIDATION:
1. Create a "Fat Freezing Health Check" form using the built-in template.
   Attach it to the Fat Freezing service.
2. Create a test booking for Fat Freezing. Check intake_responses row
   created with a token.
3. Open /intake/{token} → verify the form renders. Fill all fields
   including signature. Submit. Check submitted_at in DB.
4. Open the booking in /admin/bookings → see "Completed" pill +
   "View answers". Verify all answers including signature image show
   correctly.
5. Try to open the same token again → form shows as already submitted
   (or allow re-submission — either is fine, pick the simpler path).
6. Create a booking, let the token expire (set expires_at to now()-1h
   in the DB manually). Open /intake/{token} → see the expired message.
```

---

## PROMPT 20 — Customer Journey Analytics

```
Add a /admin/analytics page with a visual client lifecycle funnel,
key business KPIs, and cohort-level insights. This is the "studio
owner's command centre" — plain English, no MBA jargon, mobile-friendly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE STRUCTURE — /admin/analytics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nav: add "Analytics" to the admin sidebar (bar chart icon, between
Reports and Settings). Route: /admin/analytics. Access: owner/admin only.

Page layout (top → bottom):
  1. Period selector (pill tabs): Last 30 days · Last 90 days · This year · All time
     Default: Last 30 days. Changing the period re-fetches all sections.
  2. KPI row (4 StatCards, scroll horizontally on mobile)
  3. The Funnel (main visual)
  4. Retention heatmap
  5. Top services + Top clients tables
  6. Win-back candidates (lapsed clients)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — KPI ROW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use the existing StatCard component. Four cards:

  a) Average booking value
     Value: mean(price_pence) for completed bookings in period.
     Label: "Avg. booking value"
     Trend: vs previous same-length period (+/- %).

  b) Repeat client rate
     Value: % of clients who booked 2+ times in the period.
     Label: "Repeat client rate"
     Trend: vs previous period.

  c) No-show rate
     Value: no_shows / (no_shows + completed + cancelled) in period.
     Label: "No-show rate"
     Trend: vs previous period (down is good — show green/red accordingly).

  d) Revenue per client
     Value: total_revenue_pence / unique_clients in period.
     Label: "Revenue per client"
     Trend: vs previous period.

All computed server-side in a single Server Component with four parallel
Supabase queries. Trends use a comparison sub-query for the preceding
period of the same length.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — THE FUNNEL (main visual)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A vertical funnel with 6 stages. For each stage show:
  - Stage label (Cormorant 16px)
  - Count of clients at this stage
  - Conversion rate from the stage above (e.g. "72% from previous step")
  - Visual bar proportional to the count (sage fill, cream background)

The 6 stages:

  Stage 1 — New clients added
    COUNT of clients created in the selected period.
    (public.clients.created_at falls in the period)

  Stage 2 — First booking made
    Of those new clients, how many made at least one booking
    (any status) within 14 days of joining.

  Stage 3 — First booking completed
    Of those who booked, how many had at least one booking
    reach status='completed'.

  Stage 4 — Returned (2nd visit)
    Of those who completed a booking, how many completed a
    SECOND booking (any time, not just in the period —
    we're tracking their lifecycle, not just the window).

  Stage 5 — Package purchased
    Of those who returned, how many have at least one service_pack
    purchase on record (service_packs table, status='active' or 'expired').

  Stage 6 — Active regular (3+ completed bookings in last 90 days)
    Of all clients in the tenant (not just those who joined this period),
    how many have 3+ completed bookings in the last 90 days.
    This is the "healthy core" of the business.

Below the funnel, a plain-English insight card:
  Auto-generated server-side using a simple template (NOT AI — just
  string interpolation). Example:
  "Of every 10 new clients this month, {X} came back for a second visit.
   Your biggest drop-off is between step 2 and step 3 — {Y}% of people
   who booked never showed up. Reducing no-shows could add
   £{estimated_revenue} to your monthly revenue."
  (estimated_revenue = avg_price × (no_show_count × 0.5) — conservative
  recovery assumption)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — RETENTION HEATMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A 7-column × N-row grid (like GitHub's contribution graph):
  - X-axis: days of the week (Mon–Sun)
  - Y-axis: last 12 weeks (one row per week, most recent at top)
  - Each cell: number of completed bookings that day. Fill: cream (0)
    → sage-light (1-2) → sage (3-5) → olive (6+).
  - Hovering a cell shows: "{N} sessions on {date}".

This gives the owner an instant visual of which days/times are busiest
and where there are consistent dead zones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — TOP SERVICES + TOP CLIENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two side-by-side cards (stack vertically on mobile):

Top Services (in period):
  Service name · Sessions · Revenue · Avg ticket
  Top 5 by revenue, sorted desc.

Top Clients (in period):
  Client name · Sessions · Total spent · Last visit
  Top 10 by total spend, sorted desc.
  Each row links to the client's profile in /admin/clients.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — WIN-BACK CANDIDATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Clients who have at least 2 completed bookings ever but whose
last_booking_at < now() - 60 days. Sorted by total_spent_pence desc
(highest value lapsed clients first — prioritise recovery effort).

Table: Client name · Last visit · Total sessions · Total spent · Days since last visit
  Each row has a "Send win-back message" button → opens a pre-filled
  CommsProposalBar (trigger_kind='win_back') with the AI draft:
  "We miss you at Astrabody, {first_name}. It's been a while since your
   last session — we'd love to see you back. Book this week and enjoy
   a complimentary upgrade on us. 🌿"
  (The owner edits before sending. Uses the existing CommsProposalBar.)

Show a summary line above the table:
  "{N} clients haven't visited in 60+ days. Combined lifetime value: £{X}."

This section is always computed over ALL time (not filtered by the
period selector) because lapsed clients are a persistent operational
concern, not a time-windowed metric.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPLEMENTATION NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- All queries run server-side (Server Components + async functions).
  No client-side data fetching. The period selector updates a
  searchParam (?period=30d) and the page re-renders server-side.
- No new DB tables required — all data comes from existing tables
  (clients, bookings, service_packs).
- Create a src/lib/analytics/queries.ts file with all the raw Supabase
  queries, one function per metric. Makes it easy to unit-test later.
- The retention heatmap is a pure CSS grid (no charting library needed).
  Each cell is a <div> with a background-color computed from the count.
- No real-time updates needed — analytics data is at most 1h stale,
  which is fine. No Supabase Realtime subscriptions here.

NO NEW MIGRATION NEEDED — all queries read existing tables.

VALIDATION:
1. Navigate to /admin/analytics → page loads without error.
2. The KPI row shows 4 stat cards with non-zero values (assuming test
   bookings exist). Change period to "This year" → numbers update.
3. The funnel shows 6 stages with correct counts. The insight card
   shows a meaningful sentence (not placeholder text).
4. The retention heatmap shows filled cells on days where test bookings
   were created.
5. Top services and top clients tables show correct data matching
   /admin/reports.
6. Win-back section shows any clients whose last booking was >60 days
   ago. Click "Send win-back message" → CommsProposalBar opens with
   the pre-filled draft.
```

---

## PROMPT 21 — In-Portal AI Booking Assistant

```
Add a floating AI assistant bubble to the client portal. Clients click
it to open a conversational chat that can answer questions about their
account AND take real actions (check availability, create bookings,
show pack balance). This is the concierge for clients who find booking
forms intimidating — they just type what they want in plain English.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI — THE BUBBLE + CHAT DRAWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A floating button fixed to the bottom-right of ALL /portal/* pages:
  - 56px circle, on mobile sits 20px above the bottom safe area
  - Siri-style animated gradient bubble: a slow, looping radial gradient
    that shifts through sage (#758564) → sage-light (#BBC4AA) → olive
    (#3E3E31) → sage, rotating continuously (CSS @keyframes, ~4s loop,
    ease-in-out). The effect looks like soft light moving under the surface
    — exactly like the Siri ambient animation on iPhone.
  - At rest: the animation runs at 60% opacity / slow speed (calm, not
    distracting).
  - On hover / on first load: the animation pulses brighter and faster
    for 1.5s to catch attention, then settles back to the calm state.
  - White sparkle icon (✦) centred, 22px, always visible over the gradient.
  - Subtle drop-shadow: 0 4px 24px rgba(117,133,100,0.35)
  - Implementation: use a conic-gradient or radial-gradient animated with
    CSS @keyframes on background-position + filter:hue-rotate() to create
    the colour-shift. No canvas, no WebGL — pure CSS so it runs at 60fps
    on any phone.
  - A small red badge (count) appears top-right if the client has unread
    studio messages (reuses existing inbox unread count).
  - Tapping opens a full-height bottom sheet on mobile (max 90vh),
    a 400px centred modal on desktop (matching the 21st.dev AI Assistant
    component layout).

DESIGN REFERENCE — "AI Assistant" modal style from 21st.dev (see the
"Ai Assistant" component in the AI Chats section). The chat opens as a
modal/drawer with a dark navy header bar, a large centred empty state
with a sparkle icon and "How can I help you today?", and a full-width
rounded text input pinned at the bottom. Adapt the colours to Astrabody's
palette: header in olive (#3E3E31), body background in cream (#F6F3EE),
input bar in sand (#DED2C3).

INITIAL STATE (no messages yet):
  ┌──────────────────────────────────────────────┐
  │ ✦  Astrabody Assistant              ×        │  ← olive header, white text
  ├──────────────────────────────────────────────┤
  │                                              │
  │                  ✦                           │  ← sage sparkle icon, 40px
  │                                              │
  │       How can I help you today?              │  ← Cormorant 22px, centred
  │   Ask me anything about your account.        │  ← Inter 13px, muted
  │                                              │
  │  ┌──────────────────────────────────────┐    │
  │  │  [Book a session]                    │    │  ← chip row 1
  │  │  [My sessions remaining]             │    │  ← chip row 2
  │  │  [Current offers]                    │    │  ← chip row 3
  │  │  [My next appointment]               │    │  ← chip row 4
  │  │  [What should I try next?]           │    │  ← chip row 5
  │  └──────────────────────────────────────┘    │
  │                                              │
  ├──────────────────────────────────────────────┤
  │  [ Type your message…                  → ]   │  ← sand bg, sage send btn
  └──────────────────────────────────────────────┘

The 5 quick-action chips — displayed as full-width pill buttons stacked
vertically in the centre of the empty state (matching the 21st.dev AI
Assistant layout). Cream background, sage border, Inter 13px, 44px height:

  1. "Book a session"             → triggers booking flow
  2. "My sessions remaining"      → shows active pack balance
  3. "Current offers"             → shows active promotions + loyalty tier
  4. "My next appointment"        → shows next upcoming booking
  5. "What should I try next?"    → AI analyses history + recommends service

Tapping any chip sends it as a message instantly and transitions to the
chat view (chips disappear, thread appears above the input).

CHAT VIEW (once conversation starts):
  - Same olive header bar: "Astrabody Assistant" + close ×
  - Cream body background, scrollable message thread (newest at bottom)
  - Assistant messages: sand (#DED2C3) rounded bubble, left-aligned,
    Inter 14px olive text
  - Client messages: sage (#758564) rounded bubble, right-aligned,
    Inter 14px white text
  - Typing indicator: 3 sage dots pulsing
  - Input pinned to bottom, same rounded style as initial state
  - Small "Start over" ghost link in the header to reset the thread

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

State is kept in React useState on the client (in-memory per session).
No DB persistence needed — if the client closes and reopens the drawer
the conversation resets with a friendly greeting. This keeps it simple
and stateless server-side.

State shape:
  {
    messages: { role: 'user' | 'assistant', content: string }[],
    bookingFlow: null | {
      step: 'choose_service' | 'choose_slot' | 'confirm',
      serviceId?: string,
      serviceName?: string,
      staffId?: string,
      staffName?: string,
      slotDatetime?: string,   // ISO string
      availableSlots?: { datetime: string, staffId: string, staffName: string }[]
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER ACTION — portalAssistantChat()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single server action: portalAssistantChat(input: PortalChatInput)

PortalChatInput:
  {
    messages: { role: 'user' | 'assistant', content: string }[],
    bookingFlow: BookingFlowState | null,
    clientContext: ClientContext   // pre-fetched by the component, see below
  }

ClientContext (fetched once on drawer open, passed with every message):
  {
    clientName: string,
    tenantName: string,
    tenantTimezone: string,           // "Europe/London"

    // Services the studio offers (for booking + pricing questions)
    services: { id, name, durationMin, pricePence }[],

    // Pack catalogue — ALL purchasable packs (for "how much is a 10-pack?")
    packCatalogue: { id, name, serviceName, sessions, pricePence }[],

    // Client's active packs (sessions remaining)
    activePacks: {
      serviceName, sessionsRemaining, totalSessions, expiresAt
    }[],

    // Client's upcoming bookings
    upcomingBookings: { serviceName, staffName, startsAt, status }[],

    // Client's last 10 completed bookings (for "Book again" context)
    recentBookings: { serviceName, staffName, completedAt }[],

    // Loyalty wallet
    loyaltyPoints: number,            // current balance
    loyaltyTierName: string | null,   // "Insider", "Insider+", etc.

    // Gift card balance (if any active cards)
    giftCardBalance: number,          // pence, 0 if none

    // Studio working hours
    workingHours: { dayOfWeek, openTime, closeTime, isClosed }[],

    // Studio contact (for fallback answers)
    studioPhone: string,
    studioAddress: string
  }

The action calls Claude (claude-haiku-4-5-20251001, max 600 tokens)
with a system prompt and returns a structured response:

SYSTEM PROMPT:
  "You are the Astrabody concierge assistant embedded in the client
   portal. Astrabody is a premium aesthetic clinic in Chandler's Ford,
   UK. You are warm, friendly, and concise — you text like a helpful
   human, not a support bot. No bullet points unless listing slots.
   Never use em-dashes. UK English throughout.

   You have access to this client's complete account data:
   - Name: {clientName}
   - Loyalty points: {loyaltyPoints} pts ({loyaltyTierName})
   - Gift card credit: £{giftCardBalance/100} (0 if none)
   - Active packs: {activePacks — service, sessions left, expiry}
   - Upcoming bookings: {upcomingBookings — service, staff, date/time}
   - Recent completed sessions: {recentBookings — last 10}
   - Services & single-session prices: {services with £ prices}
   - Pack catalogue (bundles to buy): {packCatalogue with £ prices}
   - Studio hours: {workingHours as plain text}
   - Studio phone: {studioPhone}
   - Studio address: {studioAddress}

   You can do three types of actions:
   1. ANSWER: reply to a question (pack balance, prices, hours, etc.)
   2. SHOW_SLOTS: trigger an availability check for a service + date
   3. CONFIRM_BOOKING: finalise a booking the client has chosen

   Always respond with a valid JSON object in this shape:
   {
     'message': '<your reply to the client in plain conversational English>',
     'action': null
       | { 'type': 'SHOW_SLOTS', 'serviceId': '...', 'date': 'YYYY-MM-DD' }
       | { 'type': 'CONFIRM_BOOKING',
           'serviceId': '...', 'staffId': '...', 'slotDatetime': '...' }
       | { 'type': 'CLARIFY_DATE' }
       | { 'type': 'CLARIFY_SERVICE' }
   }

   Rules:
   - If the client asks to book but doesn't say which service, set
     action.type = CLARIFY_SERVICE and ask which one.
   - If the client says a day but not a date ('next Tuesday'), resolve
     it from today's date ({today} in {timezone}) and use it directly.
     If ambiguous (two possible Tuesdays), set CLARIFY_DATE.
   - If the client picks a slot from the list you showed, set
     action.type = CONFIRM_BOOKING with the exact slot details.
   - If the client asks something you can't do (cancel a booking,
     change their email, etc.), apologise briefly and say they can
     message the studio directly or call +44 7393 102167.
   - Keep replies under 80 words. Warm but efficient."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTION HANDLERS (client-side, after AI response)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After the AI returns its JSON, the component checks action.type:

SHOW_SLOTS:
  - Call the existing /api/availability endpoint with serviceId + date.
  - Render the results as interactive slot pills in the chat (NOT as
    text — actual tappable UI elements):
    ┌─────────────────────────────────┐
    │  Available Tuesday 6 May        │
    │  [09:00 · Tove] [11:30 · Jade] │
    │  [14:00 · Tove]                 │
    └─────────────────────────────────┘
    Each pill is a sage ghost button. Tapping one:
    - Adds the client's choice as a message: "11:30 with Jade"
    - Updates bookingFlow.step = 'confirm' with the slot details
    - The AI receives the updated messages and responds with the
      confirmation ask: "Shall I book you in for Tuesday 6 May at
      11:30 with Jade?"

CONFIRM_BOOKING:
  - Call createBookingAndIntent() server action (the same one used
    by the normal checkout, already handles packs / gift cards /
    loyalty). Pass the selected slot.
  - On success: show a confirmation card in the chat:
    ┌──────────────────────────────────────┐
    │ ✦  You're booked in                  │
    │                                      │
    │ InfraBike · Tue 6 May · 11:30        │
    │ With Jade at Astrabody               │
    │                                      │
    │ [View my bookings →]                 │
    └──────────────────────────────────────┘
  - Reset bookingFlow to null.
  - Revalidate /portal/me so the upcoming bookings reflect the new one.

CLARIFY_SERVICE / CLARIFY_DATE:
  - No extra UI — the AI's message text handles the clarification.
  - The component just appends the message to the thread.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHERE THE BUBBLE LIVES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create src/components/portal/AssistantBubble.tsx — a Client Component.
Mount it inside src/app/portal/layout.tsx so it persists across all
portal pages without re-mounting.

The component:
  1. On mount: fetches ClientContext via a server action
     getPortalAssistantContext() — one DB round-trip that pulls packs,
     upcoming bookings, services, and working hours in parallel.
  2. Renders the floating bubble.
  3. On open: shows the quick-action chips + greeting:
     "Hi {firstName} 👋 How can I help you today?"
  4. On each message: calls portalAssistantChat(), handles the action,
     appends to the message list.

Rate limit: 20 messages per client per hour (track in a simple
in-memory Map on the server — keyed by client ID. Reset after 1h.
If exceeded: "You've sent a lot of messages — take a breath and try
again in a little while 🌿").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NO NEW MIGRATION NEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All data comes from existing tables. The assistant is stateless
server-side. No new tables required.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open /portal/me → sage bubble visible bottom-right. Click it →
   drawer opens with greeting + 4 quick-action chips.
2. Tap "How many sessions do I have left?" → assistant replies with
   the correct pack balance from the DB.
3. Tap "Book a session" → assistant asks which service. Reply
   "InfraBike" → assistant asks for a date. Reply "next Tuesday" →
   slot pills appear. Tap a slot → assistant asks to confirm. Reply
   "yes" → booking created. Check DB + /portal/me upcoming bookings.
4. Ask "What are your opening hours?" → assistant replies with the
   correct hours from working_hours table.
5. Ask to cancel a booking → assistant declines gracefully and gives
   the studio phone number.
6. Send 21 messages → rate limit message appears.
7. Close and reopen the drawer → conversation resets with greeting.
```
