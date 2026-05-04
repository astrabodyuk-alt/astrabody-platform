"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Manually flip a referral from 'converted' to 'rewarded'. Used when
 * the auto-reward at booking-completion time was missed (rare —
 * usually because the booking was completed before this prompt
 * shipped). Reuses rewardReferrerOnCompletion so the loyalty credit
 * lands the same way.
 */
export async function markReferralRewardedManually(
  referralId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("referrals")
    .select("id, tenant_id, referred_client_id, status")
    .eq("id", referralId)
    .maybeSingle();
  if (!row || row.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Referral not found." };
  }
  if (row.status !== "converted") {
    return { ok: false, error: "Only converted referrals can be rewarded." };
  }
  if (!row.referred_client_id) {
    return { ok: false, error: "No referred client on file." };
  }

  const { rewardReferrerOnCompletion } = await import(
    "@/lib/referrals/actions"
  );
  await rewardReferrerOnCompletion({
    tenantId: ctx.tenantId,
    referredClientId: row.referred_client_id as string,
  });

  revalidatePath(`/admin/clients/${row.referred_client_id}`);
  return { ok: true };
}
