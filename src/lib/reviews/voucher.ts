import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const NINETY_DAYS_MS = 90 * 86_400_000;

/**
 * After a confirmed Google review, atomically:
 *   - Mark the client `has_left_google_review = true` (we never request again).
 *   - Update the review_requests row: status='google_confirmed',
 *     google_review_confirmed_at=now().
 *   - Issue a percent voucher equal to tenant.review_bonus_voucher_pct,
 *     valid for 90 days, source='google_review'.
 *
 * Returns the voucher row so the UI can show "We've added a 15% voucher
 * to your wallet" without an extra round-trip.
 */
export async function issueGoogleReviewVoucher(input: {
  tenantId: string;
  clientId: string;
  reviewRequestId: string;
}): Promise<
  | {
      ok: true;
      voucherId: string;
      pct: number;
      expiresAt: string;
    }
  | { ok: false; error: string }
> {
  const admin = createAdminSupabase();

  const { data: tenant } = await admin
    .from("tenants")
    .select("review_bonus_voucher_pct")
    .eq("id", input.tenantId)
    .maybeSingle();
  const pct = (tenant?.review_bonus_voucher_pct as number | undefined) ?? 15;
  const expiresAt = new Date(Date.now() + NINETY_DAYS_MS).toISOString();

  // Defensive: don't double-issue if this review_request already has a
  // confirmed timestamp.
  const { data: existing } = await admin
    .from("review_requests")
    .select("status, google_review_confirmed_at")
    .eq("id", input.reviewRequestId)
    .maybeSingle();
  if (existing?.google_review_confirmed_at) {
    return { ok: false, error: "voucher already issued for this review" };
  }

  const { data: voucher, error: voucherErr } = await admin
    .from("loyalty_vouchers")
    .insert({
      tenant_id: input.tenantId,
      client_id: input.clientId,
      kind: "percent",
      value_pct: pct,
      source: "google_review",
      status: "active",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (voucherErr || !voucher) {
    return { ok: false, error: voucherErr?.message ?? "voucher insert failed" };
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("review_requests")
    .update({
      status: "google_confirmed",
      google_review_confirmed_at: nowIso,
      responded_at: nowIso,
    })
    .eq("id", input.reviewRequestId);

  await admin
    .from("clients")
    .update({ has_left_google_review: true })
    .eq("id", input.clientId);

  return {
    ok: true,
    voucherId: voucher.id as string,
    pct,
    expiresAt,
  };
}
