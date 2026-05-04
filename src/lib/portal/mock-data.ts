/**
 * Mock data for the client portal V1 visual build.
 *
 * Replaced in V2 by real Supabase queries:
 *   - getCurrentClient(supabase)
 *   - getLoyaltyAccount(supabase, clientId)
 *   - getUpcomingBookings(supabase, clientId, { limit })
 *   - getProgressMetrics(supabase, clientId, { metric: 'waist' })
 *   - getTodayFlashSlots(supabase, tenantId)
 *
 * Keeping the shape identical to the eventual real query results means
 * we won't have to touch the page component when wiring to the DB.
 */

import type { LoyaltyTier } from "@/lib/utils";

export interface MockClient {
  firstName: string;
  initials: string;
}

export interface MockLoyalty {
  tier: LoyaltyTier;
  currentPoints: number;
  lifetimePoints: number;
  memberSince: string; // formatted display string
  nextReward: { name: string; costPoints: number };
}

export interface MockUpcoming {
  startsAt: string;
  service: string;
  staffName: string;
  durationMin: number;
}

export interface MockProgress {
  waistDeltaCm: number;
  weeksTracked: number;
  sessionsCompleted: number;
  startedMonth: string;
  series: number[];
}

export interface MockFlashSlot {
  id: string;
  startsAt: string;
  service: string;
  staffName: string;
  durationMin: number;
  listPricePence: number;
  flashPricePence: number;
}

export const MOCK = {
  client: {
    firstName: "Sarah",
    initials: "SR",
  } satisfies MockClient,

  loyalty: {
    tier: "insider",
    currentPoints: 2840,
    lifetimePoints: 4220,
    memberSince: "March 2026",
    nextReward: { name: "Free InfraBike session", costPoints: 3500 },
  } satisfies MockLoyalty,

  upcoming: {
    startsAt: "2026-04-29T15:30:00+01:00",
    service: "Fat Freezing — abdomen",
    staffName: "Tove",
    durationMin: 45,
  } satisfies MockUpcoming,

  progress: {
    waistDeltaCm: -4.2,
    weeksTracked: 8,
    sessionsCompleted: 7,
    startedMonth: "March",
    series: [82.0, 81.4, 81.0, 80.2, 79.6, 79.0, 78.4, 77.8],
  } satisfies MockProgress,

  flashSlots: [
    {
      id: "fs1",
      startsAt: "2026-04-27T11:30:00+01:00",
      service: "InfraBike",
      staffName: "Jade",
      durationMin: 30,
      listPricePence: 3900,
      flashPricePence: 2900,
    },
    {
      id: "fs2",
      startsAt: "2026-04-27T14:00:00+01:00",
      service: "EMS SupraSculpt",
      staffName: "Tove",
      durationMin: 30,
      listPricePence: 8000,
      flashPricePence: 6400,
    },
  ] satisfies MockFlashSlot[],
};
