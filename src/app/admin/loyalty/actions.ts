"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createCommsProposal } from "@/lib/comms/proposal-actions";

/**
 * Toggle Double Points week. Sets tenants.loyalty_double_points_until
 * to (now + 7d) when enabling, or null when disabling.
 *
 * Owners + admins only (per tenants_update RLS policy).
 *
 * NB: the actual "double the credit" logic still has to be wired into
 * loyalty_credit_booking() — flagged as a TODO in the page copy.
 */
export async function toggleDoublePointsWeek(
  enable: boolean
): Promise<{ ok: true; until: string | null } | { ok: false; error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) {
    return { ok: false, error: "owner / admin only" };
  }

  const supabase = await createServerSupabase();
  const until = enable
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await supabase
    .from("tenants")
    .update({ loyalty_double_points_until: until })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  if (enable && until) {
    const endLabel = new Date(until).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    void createCommsProposal({
      tenantId: ctx.tenantId,
      triggerKind: "loyalty_promotion",
      triggerRefId: null,
      triggerSummary: `Double points until ${endLabel}`,
      defaultSegment: { type: "tier", params: { min: "insider" } },
      createdByUserId: ctx.userId,
    });
  }

  revalidatePath("/admin/loyalty");
  return { ok: true, until };
}

interface ReferralSettings {
  enabled: boolean;
  referrerPence: number;
  referredPence: number;
  minBookingPence: number;
}

export async function updateReferralSettings(
  input: ReferralSettings
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) {
    return { ok: false, error: "owner / admin only" };
  }

  const referrer = Math.round(input.referrerPence);
  const referred = Math.round(input.referredPence);
  const min = Math.round(input.minBookingPence);
  if (![referrer, referred, min].every((v) => Number.isFinite(v) && v >= 0)) {
    return { ok: false, error: "Values must be zero or positive." };
  }
  if (referrer > 100_000_00 || referred > 100_000_00 || min > 100_000_00) {
    return { ok: false, error: "Values look too large." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update({
      referral_enabled: input.enabled,
      referral_referrer_pence: referrer,
      referral_referred_pence: referred,
      referral_min_booking_pence: min,
    })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/loyalty");
  revalidatePath("/portal/me");
  return { ok: true };
}
