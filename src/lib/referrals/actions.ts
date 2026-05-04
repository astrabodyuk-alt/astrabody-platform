"use server";

import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { lookupReferrer } from "./queries";

const REFERRAL_COOKIE = "astra_ref";

// The cookie is *set* by middleware on every /portal/book?ref=<code>
// hit (server components can't mutate cookies during render). These
// helpers are server-action-only — they read the cookie or clear it
// once the referral is claimed.
async function getReferralCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFERRAL_COOKIE)?.value ?? null;
}

async function clearReferralCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(REFERRAL_COOKIE);
}

/**
 * Called from createBookingAndIntent right after a booking row is
 * inserted. Reads the cookie, validates it, inserts a referrals row
 * with status='converted', and credits the referred client their
 * welcome bonus via loyalty_ledger.
 *
 * Idempotent — the unique index (tenant_id, referred_client_id) means
 * a second call for the same client silently no-ops.
 */
export async function claimReferralOnFirstBooking(args: {
  tenantId: string;
  referredClientId: string;
  bookingPricePence: number;
}): Promise<void> {
  const code = await getReferralCookie();
  if (!code) return;

  const lookup = await lookupReferrer(args.tenantId, code);
  if (!lookup) {
    await clearReferralCookie();
    return;
  }
  if (!lookup.enabled) return;
  if (lookup.referrer_client_id === args.referredClientId) return; // self-referral
  if (args.bookingPricePence < lookup.min_booking_pence) return;

  const admin = createAdminSupabase();

  // Has this client already been claimed? Cheap pre-check before the
  // insert (the unique index would still catch it).
  const { data: existing } = await admin
    .from("referrals")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("referred_client_id", args.referredClientId)
    .maybeSingle();
  if (existing) {
    await clearReferralCookie();
    return;
  }

  const { error } = await admin.from("referrals").insert({
    tenant_id: args.tenantId,
    referrer_client_id: lookup.referrer_client_id,
    referred_client_id: args.referredClientId,
    referral_code: code,
    status: "converted",
    converted_at: new Date().toISOString(),
    referrer_credit_pence: lookup.referrer_credit_pence,
    referred_credit_pence: lookup.referred_credit_pence,
  });
  if (error) {
    if (!String(error.message).toLowerCase().includes("duplicate")) {
      console.warn("[referral] insert failed", error);
    }
    return;
  }

  // Welcome credit for the referred client (10 pts per £1).
  const welcomePoints = Math.round(lookup.referred_credit_pence / 10);
  if (welcomePoints > 0) {
    await admin.from("loyalty_ledger").insert({
      tenant_id: args.tenantId,
      client_id: args.referredClientId,
      delta_points: welcomePoints,
      reason: "referral_welcome",
      display_label: "Welcome bonus from a friend",
    });
  }

  await clearReferralCookie();
}

/**
 * Called from markBookingCompleted. Rewards the referrer when the
 * referred client's first booking completes. Idempotent — guarded by
 * status='converted'.
 */
export async function rewardReferrerOnCompletion(args: {
  tenantId: string;
  referredClientId: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("referrals")
    .select("id, referrer_client_id, referrer_credit_pence, status")
    .eq("tenant_id", args.tenantId)
    .eq("referred_client_id", args.referredClientId)
    .maybeSingle();
  if (!row) return;
  if (row.status !== "converted") return;

  const points = Math.round((row.referrer_credit_pence as number) / 10);

  await admin
    .from("referrals")
    .update({
      status: "rewarded",
      rewarded_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "converted");

  if (points > 0) {
    const { data: referredClient } = await admin
      .from("clients")
      .select("full_name")
      .eq("id", args.referredClientId)
      .maybeSingle();
    const friend =
      ((referredClient?.full_name as string | null) ?? "your friend").split(/\s+/)[0] ??
      "your friend";
    await admin.from("loyalty_ledger").insert({
      tenant_id: args.tenantId,
      client_id: row.referrer_client_id as string,
      delta_points: points,
      reason: "referral_earned",
      display_label: `${friend} just completed their first session — thank you!`,
    });
  }
}
