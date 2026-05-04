/**
 * UK retail / wellness-industry calendar. Hardcoded month-by-month so
 * the AI advisor knows what's coming up *for the studio's location*.
 * Used as additional context inside the system prompt — the model
 * doesn't see this as a hard rule, just relevant facts.
 *
 * Each month lists key dates / themes a UK premium beauty studio cares
 * about. Black Friday is computed dynamically (last Friday of November)
 * because its date drifts year to year.
 */

export interface CalendarEvent {
  /** When this event happens. "mid", "early", "late" or a literal date. */
  when: string;
  /** Short label used in the prompt context. */
  label: string;
  /** One sentence on why it matters to a wellness studio. */
  why: string;
}

const STATIC_EVENTS: Record<number, CalendarEvent[]> = {
  1: [
    {
      when: "all month",
      label: "New Year reset",
      why: "Highest motivation week of the year. Body-goals messaging lands.",
    },
    {
      when: "all month",
      label: "Dry January",
      why: "Wellness-first mindset; pair with infrared / detox angles.",
    },
  ],
  2: [
    {
      when: "14 Feb",
      label: "Valentine's Day",
      why: "Gift-card season. Couples or self-care framing both work.",
    },
  ],
  3: [
    {
      when: "mid",
      label: "Mother's Day (UK)",
      why: "Largest single-day UK gift-card revenue moment.",
    },
    {
      when: "all month",
      label: "Spring reset",
      why: "Pre-summer body prep starts to register psychologically.",
    },
  ],
  4: [
    {
      when: "varies",
      label: "Easter / school holidays",
      why: "Family-time slowdown midweek; weekend demand stays high.",
    },
  ],
  5: [
    {
      when: "early + late May",
      label: "Bank holidays",
      why: "Longer weekends — book-out risk + treat-yourself impulse.",
    },
  ],
  6: [
    {
      when: "all month",
      label: "Pre-summer body prep urgency",
      why: "Holiday countdown: 4–6 weeks out, conversion is strongest.",
    },
  ],
  7: [
    {
      when: "all month",
      label: "Summer holidays start",
      why: "Repeat clients away — focus on retention, deposits + packs.",
    },
  ],
  8: [
    {
      when: "all month",
      label: "August lull",
      why: "Slowest month. Lean on re-engagement of dormant clients.",
    },
  ],
  9: [
    {
      when: "early",
      label: "Back-to-school",
      why: "Mums reclaim self-care budget. Strong reactivation window.",
    },
    {
      when: "mid",
      label: "Autumn body resets",
      why: "Post-holiday remorse; structured 8-week packs convert well.",
    },
  ],
  10: [
    {
      when: "mid",
      label: "Pre-Christmas planning",
      why: "Plant gift-card seeds 8 weeks out — accountants budget now.",
    },
    {
      when: "31 Oct",
      label: "Halloween",
      why: "Soft-touch only — not a beauty-industry purchase moment.",
    },
  ],
  11: [
    {
      when: "computed",
      label: "Black Friday",
      why: "Last Friday of November. UK clients now expect a discount.",
    },
  ],
  12: [
    {
      when: "all month",
      label: "Christmas gift cards",
      why: "Highest single-month gift-card revenue. End-of-year urgency.",
    },
    {
      when: "26–31 Dec",
      label: "Between-the-trees lull",
      why: "Soft week. Tee up the January New-Year campaign.",
    },
  ],
};

/** Last Friday of November of a given year (Black Friday in the UK). */
export function blackFridayDate(year: number): Date {
  const lastDay = new Date(Date.UTC(year, 10, 30));
  // Mon=1 ... Fri=5 ... Sun=0
  const dow = lastDay.getUTCDay();
  const diff = (dow + 7 - 5) % 7; // days back to most-recent Friday
  return new Date(Date.UTC(year, 10, 30 - diff));
}

/**
 * Compact calendar context for the current + next month, plus the
 * permanent blocker "Black Friday" computed for the current year.
 * Returned as plain text — fed directly into the system prompt.
 */
export function buildCalendarContext(now: Date): string {
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const lines: string[] = [];
  lines.push(`Current month: ${monthName(month)} ${year}.`);
  lines.push(`Next month: ${monthName(nextMonth)} ${nextYear}.`);

  const current = (STATIC_EVENTS[month] ?? []).map(
    (e) => `  - ${e.label} (${e.when}): ${e.why}`
  );
  if (current.length) {
    lines.push(`This month — UK retail context:`);
    lines.push(...current);
  }
  const upcoming = (STATIC_EVENTS[nextMonth] ?? []).map(
    (e) => `  - ${e.label} (${e.when}): ${e.why}`
  );
  if (upcoming.length) {
    lines.push(`Next month — plan ahead for:`);
    lines.push(...upcoming);
  }
  // Always include the dynamic Black Friday date if it falls in the
  // current or next month so the model knows the exact day.
  if (month === 11 || nextMonth === 11) {
    const bfYear = month === 11 ? year : nextYear;
    const bf = blackFridayDate(bfYear);
    lines.push(
      `Black Friday: ${bf.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}.`
    );
  }
  return lines.join("\n");
}

function monthName(m: number): string {
  return new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
  });
}

/**
 * UK bank holiday roster — three rolling years. Source of truth for the
 * Bank Holiday Planner in /admin/settings/schedule. Substitute days are
 * pre-rolled (e.g. 2027 Christmas falls on a Saturday, observed Mon).
 *
 * Refresh annually: drop the oldest year and append the next when the
 * GOV.UK list confirms the dates.
 */
export interface UkBankHoliday {
  date: string;
  name: string;
}

export const UK_BANK_HOLIDAYS: UkBankHoliday[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-05-04", name: "Early May bank holiday" },
  { date: "2026-05-25", name: "Spring bank holiday" },
  { date: "2026-08-31", name: "Summer bank holiday" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-05-03", name: "Early May bank holiday" },
  { date: "2027-05-31", name: "Spring bank holiday" },
  { date: "2027-08-30", name: "Summer bank holiday" },
  { date: "2027-12-27", name: "Christmas Day (substitute)" },
  { date: "2027-12-28", name: "Boxing Day (substitute)" },
  { date: "2028-01-03", name: "New Year's Day (substitute)" },
  { date: "2028-04-14", name: "Good Friday" },
  { date: "2028-04-17", name: "Easter Monday" },
  { date: "2028-05-01", name: "Early May bank holiday" },
  { date: "2028-05-29", name: "Spring bank holiday" },
  { date: "2028-08-28", name: "Summer bank holiday" },
  { date: "2028-12-25", name: "Christmas Day" },
  { date: "2028-12-26", name: "Boxing Day" },
];
