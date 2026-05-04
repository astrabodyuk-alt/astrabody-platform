# Design references — Astrabody Platform

> Where the visual bar is set. The Prompt 12 (Design Polish Pass) will
> read this file and apply the patterns to every screen.

## Primary reference — Apple Fitness+

The strongest reference. Why it works for Astrabody:

- **Immersive hero photos** on cards — full bleed, treatments shot like
  fitness workouts (calm body, focus on hands, equipment, environment).
- **Cards take full column width** on mobile, generous vertical
  rhythm. Not the cramped Fresha grid feel.
- **Strong sans-serif headings** stacked on the hero (we keep our
  Cormorant for editorial moments, but pair with confident Inter for
  hero overlays).
- **Subtle gradients** — sage-deep → sage-light at top of hero, fades
  into the cream background. Never garish.
- **Typography hierarchy** — huge titles (32-44px), generous spacing,
  small all-caps labels for category tags ("INFRABIKE", "EMS",
  "FAT FREEZING").
- **Dark variant available** — Apple Fitness+ has a striking dark mode
  for the watch / late-night training. Astrabody could mirror this for
  the staff side (admin = darker), keeping the client side cream.
- **Stats as oversized numbers** — see the Activity rings, the move /
  exercise / stand bars. Translate to: oversize "390" points, "£247"
  earnings this month, "+12%" vs last month — Cormorant numerical
  style, not Inter.
- **Micro-interactions** — pills bouncing, scale-down 0.97 on tap,
  ripple from tap point on cards.

## Other directions worth pulling from

### Aesop (aesop.com)
- Navigation barely-there
- Editorial product photography
- Generous whitespace
- Typography-led, not button-led

### Aman Resorts (aman.com)
- Calm, monochrome
- Hero videos that don't shout
- Sage-adjacent earth tones

### Linear (linear.app)
- Best-in-class micro-interactions
- Depth via subtle shadows + light gradients
- Hairline borders, no harsh divisions

### Calm / Headspace
- Soft transitions between screens
- Always-running ambient state (a circle pulsing, a wave moving)
- Reassuring loading states

## Astrabody-specific applications

**Client portal home** — apply Fitness+ pattern:
- Top hero card "Your next session" full-width, photo of treatment
  (or sage gradient if no photo), large date+time overlay.
- Stats row below: points, vouchers, sessions completed — oversize
  Cormorant numbers.
- Carousel of upcoming sessions if multiple, like Fitness+ workout
  carousel.

**Practitioner picker** — apply Fitness+ trainer cards:
- Photo full-width, name overlay bottom-left, specialty label
  bottom-right small caps.
- Tap → expands to detail (bio, services they offer).

**Admin home** — apply Fitness+ dashboard:
- Big numbers for today's bookings, revenue, members.
- Today's schedule as a vertical timeline (not just a list).

**Booking confirmed** — apply Fitness+ workout-completed pattern:
- Celebratory hero (sage gradient, "You're booked." in 36px).
- Calm loyalty line below: "Your wallet just earned 390 points."
- Two CTAs feel like Fitness+ "Add to favourites" / "Share".

## Shoot list (to commission later)

For the Fitness+ hero treatment, we'll need real Astrabody photography:

- 1 InfraBike pod shot, sage uplighting, no person visible (mood)
- 1 EMS arm pad close-up, sage background
- 1 Fat Freezing handle on towel, calm composition
- 1 Laser handle, sage-tinted
- 1 wide studio interior, sage / cream / wood
- 3 staff headshots — Tove, Jade, Nigel — natural light, soft sage
  background, Aesop-feel rather than corporate

Until commissioned, use placeholders (sage gradients with treatment
icons) that look intentional, not "image missing".

## Hard rules for the Polish Pass

- Never use stock photography unless commissioned-style (no Shutterstock
  default smiles).
- Photos always lean sage / cream / olive — never high-saturation.
- No drop shadows. Use elevated cards with hairline + soft cream-deep
  background instead.
- Animations under 250ms, easing `cubic-bezier(0.32, 0.72, 0, 1)`.
- Never animate during data-fetch — use shimmer or skeleton, not
  spinning dots.
