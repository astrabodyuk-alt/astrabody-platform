import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type ReviewTriggerReason =
  | "first_session"
  | "programme_complete"
  | "milestone_5"
  | "milestone_10";

const COOLDOWN_DAYS = 90;

export interface EligibilityResult {
  eligible: boolean;
  reason: ReviewTriggerReason | null;
  /** When `eligible` is false, why we skipped — surfaced in admin logs. */
  skipReason: string | null;
}

/**
 * Decide whether a just-completed booking should fire a review request.
 *
 * Hard gates (any → skip):
 *   1. Tenant has paused review requests.
 *   2. Client has already left a Google review (`has_left_google_review`).
 *   3. Client received a review request within the last 90 days
 *      (`last_review_request_at`).
 *
 * Trigger reasons (priority order):
 *   - programme_complete: this booking consumed the last session of a
 *     pack (client_packages.status flipped to 'consumed' for it).
 *   - milestone_10: client now has exactly 10 completed bookings.
 *   - milestone_5: client now has exactly 5 completed bookings.
 *   - first_session: client now has exactly 1 completed booking.
 *
 * Returns null reason when none apply — staff can mark a booking
 * completed without firing the request.
 */
export async function evaluateBookingForReviewTrigger(
  bookingId: string
): Promise<EligibilityResult> {
  const admin = createAdminSupabase();

  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, client_id, status, client_package_id, " +
        "tenants:tenant_id (review_requests_paused), " +
        "clients (has_left_google_review, last_review_request_at)"
    )
    .eq("id", bookingId)
    .maybeSingle();

  type RawBooking = {
    id: string;
    tenant_id: string;
    client_id: string;
    status: string;
    client_package_id: string | null;
    tenants:
      | { review_requests_paused: boolean | null }
      | { review_requests_paused: boolean | null }[]
      | null;
    clients:
      | {
          has_left_google_review: boolean | null;
          last_review_request_at: string | null;
        }
      | {
          has_left_google_review: boolean | null;
          last_review_request_at: string | null;
        }[]
      | null;
  };
  const booking = bookingRaw as unknown as RawBooking | null;

  if (!booking) {
    return { eligible: false, reason: null, skipReason: "booking not found" };
  }
  if (booking.status !== "completed") {
    return {
      eligible: false,
      reason: null,
      skipReason: `booking is ${booking.status}, not completed`,
    };
  }

  const tenant = pickFirst<{ review_requests_paused: boolean | null }>(
    booking.tenants
  );
  if (tenant?.review_requests_paused) {
    return {
      eligible: false,
      reason: null,
      skipReason: "tenant has paused review requests",
    };
  }

  const client = pickFirst<{
    has_left_google_review: boolean | null;
    last_review_request_at: string | null;
  }>(booking.clients);
  if (client?.has_left_google_review) {
    return {
      eligible: false,
      reason: null,
      skipReason: "client has already left a Google review",
    };
  }
  if (client?.last_review_request_at) {
    const last = new Date(client.last_review_request_at).getTime();
    const ageMs = Date.now() - last;
    const cooldownMs = COOLDOWN_DAYS * 86_400_000;
    if (ageMs < cooldownMs) {
      return {
        eligible: false,
        reason: null,
        skipReason: `inside ${COOLDOWN_DAYS}-day cooldown`,
      };
    }
  }

  // Programme-complete check: did this booking just consume the last
  // session of a pack?
  if (booking.client_package_id) {
    const { data: pack } = await admin
      .from("client_packages")
      .select("status, sessions_remaining")
      .eq("id", booking.client_package_id)
      .maybeSingle();
    if (
      pack?.status === "consumed" ||
      (pack?.sessions_remaining as number | null) === 0
    ) {
      return { eligible: true, reason: "programme_complete", skipReason: null };
    }
  }

  // Milestone check by lifetime completed-booking count.
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", booking.tenant_id)
    .eq("client_id", booking.client_id)
    .eq("status", "completed");
  const completedCount = count ?? 0;

  if (completedCount === 10) {
    return { eligible: true, reason: "milestone_10", skipReason: null };
  }
  if (completedCount === 5) {
    return { eligible: true, reason: "milestone_5", skipReason: null };
  }
  if (completedCount === 1) {
    return { eligible: true, reason: "first_session", skipReason: null };
  }

  return {
    eligible: false,
    reason: null,
    skipReason: `${completedCount} completed bookings (no milestone match)`,
  };
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
