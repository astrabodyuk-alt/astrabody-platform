# Astrabody Platform — Design DNA

> Source of truth for every design decision in the platform. Synthesised
> from a study of 8 reference brands (Apple, Airbnb, Linear, Superhuman,
> Stripe, Notion, Claude, Revolut) cross-referenced with Astrabody's own
> sage / cream / Cormorant identity. Read this before opening any
> component file.

---

## 1. The one-line brief

> **The quiet luxury of showing up for yourself.**
> Editorial restraint, materiality, calm motion, never shouty.
> Aesop meets Apple, with a serif headline.

---

## 2. The Top-10 patterns we are stealing (and from whom)

| #  | Pattern                                                                  | Stolen from        |
|----|--------------------------------------------------------------------------|--------------------|
| 1  | Subpixel-rendered 0.5 px hairline borders                                | Apple, Linear      |
| 2  | Three-stop layered soft shadows, never one heavy drop                    | Apple, Airbnb      |
| 3  | Editorial serif on numbers and hero titles, Inter for everything else    | Stripe, Claude     |
| 4  | 8 px grid for everything: 8 / 16 / 24 / 32 / 48 / 64                     | Apple, Linear      |
| 5  | One accent at a time. Sage by default, terracotta only for success       | Stripe, Revolut    |
| 6  | 200 ms ease-out cubic on every state change                              | Superhuman         |
| 7  | Glass / backdrop blur only on the bottom nav and on the loyalty hero card | Apple              |
| 8  | Numbers and prices in tabular-nums (so columns line up)                  | Stripe, Superhuman |
| 9  | Soft pulse + scale (0.95 → 1) on confirmations, never confetti           | Superhuman         |
| 10 | Photography or quiet illustration only. No stock corporate vectors       | Airbnb, Notion     |

## 3. Tokens (these are non-negotiable)

### 3.1 Colour

We never use pure black or pure white. The whole platform lives between
cream and olive, with sage as voice.

| Role         | Token                | Hex          |
|--------------|----------------------|--------------|
| Page background | `cream`           | `#F6F3EE`    |
| Surface      | `cream-deep`         | `#EFEAE2`    |
| Card on cream | `surface`           | `#FFFFFF`    |
| Sand (ambient cards) | `sand`       | `#DED2C3`    |
| Primary brand | `sage`              | `#758564`    |
| Primary brand pressed | `sage-deep` | `#5C6B4E`    |
| Primary brand soft | `sage-light`   | `#BBC4AA`    |
| Body text    | `olive`              | `#3E3E31`    |
| Muted text   | `olive-soft`         | `rgba(62,62,49,0.62)` |
| Hint text    | `olive-faint`        | `rgba(62,62,49,0.42)` |
| Hairline default | `hairline`       | `rgba(62,62,49,0.08)` |
| Hairline hover | `hairline-strong` | `rgba(62,62,49,0.14)` |
| Success accent | `terracotta-soft` | `#C9623F`    |
| Inner Circle gold | `gold`           | `#B8945A`    |
| Inner Circle gold soft | `gold-soft` | `#E5D2A8`    |
| Destructive  | `destructive`        | `#D45B5B`    |

**Rule of thumb**: at most three of these colours appear in any single
viewport. Cream + olive + one accent. If a fourth wants to creep in,
something is wrong.

### 3.2 Typography

Two families. Two weights each. Never more.

| Use                   | Family               | Weight  | Size  | Tracking | Notes |
|-----------------------|----------------------|---------|-------|----------|-------|
| Editorial display     | Cormorant Garamond   | 400     | 56 px | -0.02em  | Hero titles, big numbers in loyalty card |
| Page heading          | Cormorant Garamond   | 500     | 22-32 px | -0.01em | Section titles |
| Body                  | Inter                | 400     | 15-16 px | -0.005em | Default everywhere |
| UI label / meta       | Inter                | 500     | 11-12 px | +0.16em uppercase | All-caps labels above values |
| Tabular numbers       | Inter                | 500     | inherit | font-feature-settings: "tnum" | Prices, points, dates |

**Rule of thumb**: serif is reserved for *moments* — the loyalty
balance, the booking confirmation count, the page title. Body, button
labels, micro-copy and metadata are always Inter.

### 3.3 Spacing scale

8 px grid, full stop.

`8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`

- Inside cards: 16-20 px padding.
- Card to card vertical gap: 16 px (tight) or 24 px (sectioned).
- Section break inside a page: 48 px.
- Hero pages get 64-96 px above the headline.

### 3.4 Corners

| Element                       | Radius  |
|-------------------------------|---------|
| Tag / pill                    | 999px   |
| Button                        | 999px   |
| Input                         | 12 px   |
| Standard card                 | 22 px   |
| Hero / loyalty card           | 28 px   |
| Phone shell mockups           | 56 px outer / 44 px inner |

We never use sharp corners. Soft radii are part of the calm.

### 3.5 Borders

Always 0.5 px (or 1 px on hi-DPI fallback). We use border colour to
hint depth, never to enclose like a document. A 1-px-or-thicker border
reads as a form, not a surface.

### 3.6 Shadows — three layers only

```
shadow-1  : 0 1px 2px rgba(62,62,49,0.05)                                   /* resting card */
shadow-2  : 0 0.5px 1px rgba(62,62,49,0.06), 0 4px 18px rgba(62,62,49,0.06) /* default card */
shadow-3  : 0 1px 2px rgba(62,62,49,0.06),
            0 4px 12px rgba(62,62,49,0.06),
            0 24px 64px rgba(62,62,49,0.10)                                 /* hero / floating */
shadow-btn: 0 1px 2px rgba(62,62,49,0.10), 0 8px 20px rgba(62,62,49,0.12)   /* primary button */
shadow-lift (hover): the next level up + a 1 px upward translate
```

Never solid black shadows. Never blur > 24 px in a single shadow.

### 3.7 Motion

- **Default duration**: 200 ms
- **Default easing**: `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out, slightly
  pronounced — the Superhuman / Apple springiness without the bounce)
- **Page transitions**: 240 ms fade + 4 px upward translate
- **Confirmations** (booking confirmed, points credited): scale 0.96 → 1 +
  fade-in over 280 ms, with a 600 ms pulse on the relevant number after
- **Hover**: never colour change alone. Always a 1 px translate or a
  shadow lift to indicate physical response.
- **No bounces, no spins, no confetti.** Calm.

### 3.8 Glass / backdrop blur

Used in exactly two places.

1. The **bottom nav** of the PWA: `background: rgba(246,243,238,0.78); backdrop-filter: blur(24px)`.
2. The **tier badge** sitting on the loyalty hero card's dark gradient:
   `background: rgba(255,255,255,0.10); backdrop-filter: blur(20px)`.

Anywhere else, glass becomes noise.

## 4. Component patterns

### 4.1 The loyalty hero card

The single most important surface in the app. It carries Status.

- Background: 165° linear gradient `#2F3829 → #5C6B4E → #758564`
- Inner highlight: `inset 0 1px 0 rgba(255,255,255,0.10)`
- Two soft external shadows (shadow-2 + a wider 18 px / 40 px lift)
- A radial highlight clipped to the top-right corner (10 % white) and
  a radial wash from bottom-left (12 % sage-light)
- Tier badge top-left in glass with a 6 px gold dot that pulses
- Big Cormorant number on lifetime points balance
- Inter all-caps 11 px label sitting above the number, 16 % tracking
- Progress bar uses a sage-light → gold-soft horizontal gradient

This is the only card with a saturated background. Everything else
respects the cream canvas.

### 4.2 Standard cards

White surface, 0.5 px hairline, 22 px radius, shadow-2, 18-22 px
padding. Three sub-types:

- **Upcoming session card** — date block on the left in cream-deep,
  service name in Inter 500, meta in olive-soft, chevron on the right
  as a 36 px circle.
- **Progress card** — a paired-stat row at the top (Cormorant 32 px
  number + tiny Inter delta), a 60 px sparkline below using sage-deep
  stroke and a sage-tinted area fill.
- **Flash slot card** — left: time in Cormorant. Middle: title (Inter
  500) + meta (Inter 13 px olive-soft). Right: now-price in Cormorant
  sage-deep, was-price in tiny olive-faint with line-through.

### 4.3 Buttons

Three variants only.

| Variant     | Background | Text   | Border         | Shadow       | Hover                       |
|-------------|------------|--------|----------------|--------------|-----------------------------|
| `primary`   | olive      | cream  | none           | shadow-btn   | translate-y -1 + shadow lift |
| `secondary` | white      | olive  | 0.5 px hairline-strong | shadow-1 | hairline-strong + shadow-2 |
| `ghost`     | transparent | sage-deep | none        | none         | underline on text           |

12 px vertical / 22 px horizontal padding. 999 px radius. 14 px Inter
500. Never ALL CAPS.

### 4.4 Inputs

`12 px` radius, 0.5 px hairline-strong, 14 px Inter, 12 px padding.
Focus ring: 2 px sage at 0.4 alpha, no border-colour change.

### 4.5 Pills / badges

`999 px` radius, 5 px / 11 px padding, 12 px Inter 500. Background
`cream-deep` for ambient pills, `rgba(184,148,90,0.10)` for Inner Circle
gold pills. A 5 px coloured dot sits 6 px before the label.

### 4.6 Bottom nav (PWA)

86 px tall, glass background (see 3.8). Four items max: Home, Book,
Chat, You. Active state: sage-deep colour + a faint 4 px sage dot
above the icon. Icons are 22 px stroke-1.6 line icons (lucide-react).

## 5. Imagery

- Photography should be warm-toned, soft natural light, sage / cream
  in-frame where possible. The Astrabody website's photos are the
  reference.
- Never stock-vector illustrations of hands, doctors, or "concept" art.
- Subtle abstract shapes only (a single circle, a soft gradient blob)
  if a section truly needs colour but no photography is available.
- Photos always sit on rounded 22 px masks with a 0.5 px hairline.

## 6. Voice and microcopy

Microcopy lives in this design DNA because tone is a visual asset.
Astrabody's brand voice (`Knowledge_Base/03_voix_et_ton.md`) applies
verbatim:

- UK English everywhere.
- Contractions, varied sentence length, "I" not "we".
- One emoji never. (✨ allowed, very sparingly, on a confirmation only.)
- No "thank you for…", no "we strive to…", no marketing-speak.
- Numbers always in tabular-nums.
- Dates: "29 Apr · 3:30 pm". Never "April 29th, 2026 at 3:30 PM".

## 7. Accessibility floor

- Body text contrast minimum 4.5:1 (olive on cream is fine at 8.2:1).
- Tap targets minimum 44 × 44 px.
- Focus states never invisible — always a 2 px sage ring at 0.4 alpha.
- Motion reduced when `prefers-reduced-motion: reduce` is set.

## 8. What we do NOT do

- No gradients on buttons. Solid olive only.
- No drop-shadows beyond the three layers above.
- No coloured shadows (no sage-tinted shadow under a sage button).
- No "neumorphism", no skeuomorphism, no glass on standard cards.
- No bouncy animations.
- No multiple emojis per surface.
- No saturated red, blue, or yellow. Destructive is a soft red, not a
  fire-engine red.
- No font weight 700 or higher. We don't shout.

## 9. Reference hierarchy (when in doubt, defer in this order)

1. **Apple** — primary canon for everything. Typography weights, motion
   curves, layered neutral shadows, glass with `saturate(180%)`,
   tabular-nums on every numeral, `:focus-visible` only, scale-down tap
   on press, three-layer surface system, single-accent-per-viewport.
2. **Stripe** — used only for the **checkout / payments surface**:
   slightly more refined gradients on the pay button, weight-300 on
   amount totals, monospace on card numbers and expiry, success state
   uses Stripe's "soft accent flash" pattern (sage instead of
   indigo).
3. **The other six brands** — only when Apple has no opinion on a
   specific pattern. Examples: Notion's serif blockquote pattern for
   the "session note" card, Airbnb's photo-grid radius pattern for the
   treatment menu, Linear's command palette for staff admin (V2).

Outside these three, do not invent.

## 10. 21st.dev component compatibility

Components imported from `21st.dev` are shadcn/ui-compatible by design
— they read from the standard shadcn CSS variables. Our `globals.css`
maps these variables onto Astrabody tokens, so any 21st.dev block
dropped into `src/components/` automatically adopts our palette and
typography:

```
--background          → cream
--foreground          → olive
--primary             → sage
--primary-foreground  → cream
--card                → #FFFFFF
--card-foreground     → olive
--muted               → cream-deep
--muted-foreground    → olive-soft
--border              → hairline
--ring                → sage @ 0.4 alpha
--radius              → 0.75rem (12 px) — overrides for cards / hero in component code
```

When importing a 21st.dev block, the only adjustments needed are
typically: (a) check the radius is one of our four canonical values,
(b) confirm any inline shadows use our three-layer palette, not
`rgba(0,0,0,...)` defaults, (c) ensure numerals get `tabular-nums`.

## 11. References

- Astrabody site (existing) — `astrabody.co.uk`
- `Knowledge_Base/03_voix_et_ton.md` — voice and microcopy
- `awesome-design-md-main/design-md/{apple,airbnb,linear.app,superhuman,stripe,notion,claude,revolut}` — source brand references (read once, internalised here)
- `astrabody-platform/docs/design-preview.html` — the canonical visual mock you can open in Safari
- `21st.dev` — supplementary component library (shadcn-compatible)

This document and the visual mock are the only things any future
component file should need to be consistent with the rest.
