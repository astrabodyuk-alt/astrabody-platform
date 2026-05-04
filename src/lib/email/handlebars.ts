/**
 * Client-safe constants for the template editor sidebar.
 *
 * Kept separate from render.ts (server-only) so client components can
 * import the trigger → variables map without dragging in the marked
 * runtime or the supabase admin client.
 */

export const HANDLEBARS_BY_TRIGGER: Record<string, string[]> = {
  manual: ["client.first_name", "client.full_name", "tenant.name"],
  signup: ["client.first_name", "client.full_name", "tenant.name"],
  booking_confirmed: [
    "client.first_name",
    "client.full_name",
    "booking.starts_at_friendly",
    "booking.time",
    "service.name",
    "staff.first_name",
    "staff.display_name",
    "tenant.name",
  ],
  booking_reminder_24h: [
    "client.first_name",
    "booking.starts_at_friendly",
    "booking.time",
    "service.name",
    "staff.first_name",
    "tenant.name",
  ],
  session_after_care: [
    "client.first_name",
    "service.name",
    "staff.first_name",
    "tenant.name",
  ],
  reengagement_60d: [
    "client.first_name",
    "tenant.name",
    "voucher.code",
    "staff.first_name",
  ],
  birthday: ["client.first_name", "tenant.name", "voucher.code"],
  tier_unlock: ["client.first_name", "tier", "tenant.name"],
  review_request: ["client.first_name", "service.name", "tenant.name"],
  referral_invite: ["client.first_name", "tenant.name", "voucher.code"],
};
