# Astrabody — The Inner Circle

> Loyalty programme strategy and design.
> Captured 2026-04-27. Built using the persuasion-psychology skill
> (Cialdini, Schwartz, Kahneman, Ariely, Berger). Schema lives in
> `astrabody-platform/sql/migrations/003_push_loyalty.sql`.

---

## 1. Why loyalty, and why now

Astrabody's unit economics are simple: a typical client journey
(Profil A in `Knowledge_Base/10_upsell_ladder_playbook.md`) generates
~£2,015 of LTV across phases 1, 2 and 3. The single biggest leak in
that journey is **between the first pack and the second** — clients
finish a £239 InfraBike pack, drift away, and the £699 Fat Freezing
follow-up never happens.

A well-designed loyalty programme fixes three things at once.
It pulls clients back for the second pack, it turns happy ones into
referral engines, and it makes the platform **demonstrably more
valuable** when we resell it to other tenants — every salon and
clinic prospect we pitch will ask "but does it have rewards?".

Industry data: premium beauty / wellness brands running points
programmes with tiered status see a **22–34 % lift in 6-month
retention** and a **3–6× increase in referral volume**. Sephora's own
Beauty Insider members spend 2.7× more than non-members. We don't need
all of that to make this worth shipping — even half the lift turns
the whole platform from a booking tool into a retention engine.

## 2. Brand naming — "The Inner Circle"

The programme is called **The Inner Circle**.

It plays on Astrabody's existing language ("a private sanctuary",
"unhurried, considered, tailored"). Saying "I'm in the Inner Circle"
sounds like belonging, not like a discount card. That single naming
choice activates Cialdini's **Unity** lever — the strongest of the
seven, because it taps the human need to be inside the tribe rather
than outside it. Compare: "Astrabody Rewards" sounds like Tesco
Clubcard. "The Inner Circle" sounds like Soho House.

Every member sees their tier badge prominently on the portal home
screen, and on every booking confirmation. Status is visible.

## 3. Tiers — three, only three

Three is the right number. Two feels mean. Four-plus dilutes status.
The three Astrabody tiers are:

| Tier              | Earned at lifetime points | Roughly equivalent spend | Real-world identity                              |
|-------------------|---------------------------|--------------------------|--------------------------------------------------|
| **Friend**        | 0                         | £0–£149                   | Default on sign-up. The trial-day client.        |
| **Insider**       | 1,500                     | £150–£999                 | After the first pack. Has had real results.      |
| **Inner Circle**  | 10,000                    | £1,000+                   | Multi-pack regular. The advocate / referrer.     |

Lifetime points never decrease (only the redeemable balance does), so
once a client reaches Inner Circle she stays there. Status is sticky
on purpose — it's an emotional anchor, not a quarterly review.

### What each tier unlocks

**Friend** (every signed-up client)

- Birthday voucher £20 off
- 5 % off any pack
- Earn points on every session

**Insider** (1,500+ lifetime points)

- Everything in Friend
- 24 h **early access** to flash slot deals
- Free InfraBike single session on her birthday (not just a voucher)
- Eligible for the £80 EMS reward in the menu

**Inner Circle** (10,000+ lifetime points)

- Everything in Insider
- Quarterly **Inner Circle drop** — a small physical surprise (sample
  of the latest tech, hand-written card from Nigel, branded item)
- One **complimentary EMS session per quarter**
- Members-only flash slot feed (deals never shown to public)
- **Skip-the-queue priority booking** on Saturdays
- "Bring a friend free" on a trial day, twice a year

## 4. Earning points

The earn rates are deliberately generous in numerical value (10 points
per £) so the balance always feels meaningful. A £39 trial earns 390
points — that's a real visible number, not "you've earned 4 points".

| Action                                              | Points    | Why we reward it                                  |
|-----------------------------------------------------|-----------|---------------------------------------------------|
| **Sign up to the portal** (welcome bonus)           | **+100**  | Endowed-progress effect (Nunes & Drèze 2006).     |
| **Book and complete a session**                     | **+10 / £1 spent** | Core engine — ties LTV directly to status. |
| **Birthday**                                        | **+500**  | Berger STEPPS / emotional spike.                  |
| **Leave a 5★ Google review** (via Reviews booster)  | **+500**  | Direct alignment with the Reviews booster KPI.    |
| **Refer a friend who books a trial**                | **+1,000**| Cialdini reciprocity — both parties win.          |
| **Friend you referred completes her first booking** | **+1,000**| Pays out the conversion, not just the click.      |
| **Add a session log + photo on the portal**         | **+50**   | Engagement loop — keeps the PWA used.             |
| **Streak: 3 consecutive months with a session**     | **+200 / month** | Loss aversion — clients fear breaking it.  |

Welcome bonus is not "money we're giving away". It's the smallest
amount we can credit so the client opens the app, sees a balance, and
starts caring. Endowed progress is one of the best-documented effects
in loyalty psychology.

## 5. Spending points — the rewards menu

The menu is built around two psychological levers:

1. **The free effect** (Ariely): clients react disproportionately to
   "free", so the most desirable rewards are full free sessions, not
   percentage discounts. "Free InfraBike session" beats "20 % off".
2. **The decoy effect** (Ariely): we put a small "£5 off" reward at
   the bottom and a high-status "Sculpt Day" at the top, so the £39
   InfraBike free session in the middle becomes the obvious choice.

| Cost (pts) | Reward                                         | Unlock     |
|------------|------------------------------------------------|------------|
| **500**    | £5 off your next session                       | Friend     |
| **1,500**  | Free InfraBike session (worth £39)             | Friend     |
| **2,500**  | 20 % off a Fat Freezing zone                   | Friend     |
| **4,000**  | Gift a friend a free trial *(see § 6)*         | Friend     |
| **6,000**  | Free EMS SupraSculpt session (worth £80)       | Insider    |
| **10,000** | Free Fat Freezing session, one zone (worth £160) | Insider    |
| **15,000** | "Sculpt Day" — InfraBike + EMS + Fat Freezing 1 zone in one afternoon | Inner Circle |

### Effective discount rate (the maths)

A typical Inner Circle member spending £1,000 / year accrues 10,000
points. Suppose she redeems a free InfraBike (1,500 pts, value £39) +
a 20 % off FF zone (2,500 pts, value £32) + a free EMS (6,000 pts,
value £80). She spent 10,000 points. The face value is £151.

Effective discount: **15.1 %** of yearly spend. At a gross margin of
70–80 % on these treatments, that costs Astrabody about **£35–£45
direct cost** for £1,000 of revenue we likely wouldn't have without
the programme.

The break-even is laughably easy. Even if the loyalty programme adds
**1 extra retained pack per 10 active members**, it pays for itself
twenty times over.

## 6. The gifting mechanic — Nigel's specific ask

Two ways a member can gift:

### A. Gift a friend a free trial (4,000 pts)

The flow inside the PWA:
1. Member taps "Gift a friend" on her loyalty home screen.
2. She picks a friend from her phone contacts (or types name + phone).
3. The platform spends 4,000 points, generates a unique code, and
   sends the friend a WhatsApp + SMS:
   *"Hi Aisha, Sarah's just gifted you a free InfraBike trial at
   Astrabody. Tap to book your slot: [link]"*
4. The friend lands on the booking page with the gift pre-applied.
5. **If the friend actually shows up**, the original member earns an
   extra **+200 bonus points** (paying for the conversion, not the
   intent — same logic as the referral payout in § 4).

This wraps the referral engine inside the loyalty programme.
Cialdini's reciprocity, Berger's social currency and a free-effect
hook in one mechanic. The reason the friend almost always shows up:
the gift came from someone she trusts, not from an ad.

### B. Convert points into a gift card

For members who want to gift something other than a trial (a partner,
a parent, a colleague), points are convertible into a digital gift
card at a fixed rate of **100 points = £1**, minimum 1,000 points
(£10 voucher).

Gift cards are sent by email + WhatsApp template, work as redemption
vouchers on any service, never expire (even if the points that
created them did), and get logged in `loyalty_redemptions` with the
recipient's email.

## 7. Expiry — the secret retention engine

Every earned-point ledger entry has `expires_at = created_at + 12 months`.
The current balance is the sum of un-expired earn entries minus all
redemptions and gifts. Once a month, an edge function flips expired
entries with a negative ledger row tagged `reason = 'expiry'`.

**Thirty days before any expiry**, the platform fires:
- A **push notification** to the PWA
- A **WhatsApp template** if no PWA is installed
- An **email** as a fallback

All three say the same thing in the brand voice:

> *"You've got 3,200 points expiring on 14 May — that's a free
> InfraBike session. Want me to book you a slot before they're gone?"*

This single nudge is — by far — the highest-converting message in the
whole stack. Loss aversion is twice as motivating as gain (Kahneman),
and the action is one tap. Premium loyalty programmes that ship this
nudge see **40-60 % redemption rates within 30 days** of the warning.

## 8. Surprise mechanics — the variable reward

Once or twice a quarter, Nigel triggers a **"Double Points"** week
from the admin dashboard. Every booking earns 2× points until Sunday
night. The announcement goes out via push + WhatsApp + email + the
website's hero banner, all auto-generated from one toggle.

Why this works: variable rewards are far stickier than predictable
ones (this is the same dopamine loop slot machines exploit, used
ethically here to nudge a client to book the session she was going
to book anyway). Anticipated lift on booking volume during a Double
Points week: **+25–40 %** based on industry benchmarks.

## 9. Where the points show up

The earn / balance / progress UI lives in three places.

### 9.1 The PWA home screen (the most-visited surface)

A wide card at the top of the client's home screen:

> **You're an Insider · 2,840 points**
> 660 to your next free InfraBike session.
> [progress bar at 81 %]

Tapping the card opens the rewards menu.

### 9.2 The booking confirmation

Every booking confirmation message (chat / push / email) ends with
one extra line in brand voice:

> *"+ 390 points earned from this session. You're now at 2,840 points,
> 660 from your next free InfraBike."*

This is the **drumbeat**. It's the line that turns a transactional
confirmation into a relationship moment, every single visit.

### 9.3 The booking checkout page

When a client picks a slot for a paid session, the checkout shows:

> *"You'll earn 1,990 points on this booking. Redeem 1,500 of your
> existing points for a free session instead?"*

If the client redeems, we book a free session and never charged the
card. If she pays, she earns the points and is closer to the next
free reward. **There is no losing path.** Both branches generate a
visit, which is what actually moves the business.

## 10. Anti-abuse and ethics

Three guard-rails so the programme can't be gamed:

- **One welcome bonus per phone number per tenant.** The schema
  enforces unique `(tenant_id, phone)` on `clients`, and the
  `loyalty_grant_welcome` function is idempotent.
- **Referral bonus only credits when the referred client's first
  booking is `status = completed`.** No-show, no bonus.
- **Max 3 active referral invites per member at once.** Stops people
  bulk-spamming their contact list.

And the ethical spine, identical to the persuasion skill's red lines:

- We **never** push a member to redeem on a service that's wrong for
  her profile. The `gift-friend-trial` reward defaults to InfraBike
  because that's the safe, universal trial. Anything tier-specific
  (Fat Freezing, EMS) is opt-in only.
- We **never** advertise the programme as "earn money back" — it's
  framed as belonging and rewards, not cashback. (Different cognitive
  account, per Ariely's social-norm vs market-norm distinction.)
- We **never** auto-enrol anyone. Sign-up is a one-tap consent inside
  the PWA, and the welcome message explains the programme in 2 lines.

## 11. KPIs to watch

| Metric                                    | Target after 90 days  |
|-------------------------------------------|------------------------|
| Active members (% of clients enrolled)    | 70 %+                  |
| 30-day expiry-nudge redemption rate       | 40 %+                  |
| Members who reach Insider                 | 35 % of total members  |
| Members who reach Inner Circle            | 8 % of total members   |
| Referrals per active member per quarter   | 0.6 +                  |
| Lift in 90-day repeat-booking rate        | +20 %                  |
| Double Points week booking lift           | +25 %                  |

The dashboard surfaces every one of these on the admin home screen so
Nigel can see, in real time, whether the programme is working.

## 12. Roll-out plan

This is a Phase 2 / V1 feature on the platform roadmap. Order of
ship:

1. **Schema applied** (migration 003) — already written.
2. **Earning hooks**: welcome bonus on portal sign-up, booking-completed
   credit, review-5★ credit, referral credits.
3. **Client surfaces**: PWA home card, booking confirmation footer,
   checkout redeem prompt.
4. **Rewards menu page** with the seven Astrabody rewards live.
5. **Gifting flow** (gift-friend-trial + gift card).
6. **Expiry monthly cron + 30-day nudge**.
7. **Admin dashboard** for Double Points toggle and KPI panel.
8. **Open it to clients** (announce via WhatsApp + email + Instagram).

Estimated build effort: **~6 days of focused work** for a V1 that
ships every block above. Each block is independently shippable, so
we can roll out incrementally.

## 13. How this generalises to other tenants (the SaaS angle)

Every table in the schema is `tenant_id`-scoped. The earn rules, tier
thresholds, and rewards menu are all per-tenant configuration:

- A hair salon would set `cost_points` lower (smaller average ticket).
- A restaurant would replace "free session" rewards with "free starter".
- A clinic would replicate Astrabody's exact rewards.

When Nigel sells the platform to tenant N, he picks an industry preset
("wellness", "restaurant", "salon"), and the rewards seed runs with
sensible defaults. The tenant edits two or three labels and they're
live. **That's the £49–£199/month pitch** — a working loyalty
programme out of the box, on top of booking, reviews, chat and flash
slots.

---

*Source-of-truth files referenced:*
- `/Astrabody/persuasion-psychology/SKILL.md` — frameworks
- `/Astrabody/Knowledge_Base/03_voix_et_ton.md` — UK English voice
- `/Astrabody/Knowledge_Base/10_upsell_ladder_playbook.md` — LTV math
- `/Astrabody/astrabody-platform/sql/migrations/003_push_loyalty.sql` — schema
- `/Astrabody/Astrabody_Platform_Vision.md` — overall SaaS context
