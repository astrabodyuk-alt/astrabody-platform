"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { issueGoogleReviewVoucher } from "@/lib/reviews/voucher";
import { sendInternalNpsFeedback } from "@/lib/reviews/internal-email";
import {
  insertNotification,
  getOwnerOrAdminUserIds,
} from "@/lib/notifications/insert";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Resolve the review_request the current portal client is allowed to
 * touch. Returns null if the user isn't signed in or the request id
 * doesn't belong to them.
 */
async function getReviewIfMine(
  reviewRequestId: string
): Promise<{
  id: string;
  tenantId: string;
  clientId: string;
  status: string;
  npsScore: number | null;
  googleReviewClicked: boolean;
  googleReviewConfirmedAt: string | null;
} | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return null;
  const clientId = link.client_id as string;

  const { data } = await admin
    .from("review_requests")
    .select(
      "id, tenant_id, client_id, status, nps_score, google_review_clicked, google_review_confirmed_at"
    )
    .eq("id", reviewRequestId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    tenantId: data.tenant_id as string,
    clientId: data.client_id as string,
    status: data.status as string,
    npsScore: (data.nps_score as number | null) ?? null,
    googleReviewClicked: (data.google_review_clicked as boolean | null) ?? false,
    googleReviewConfirmedAt: (data.google_review_confirmed_at as string | null) ?? null,
  };
}

/**
 * Step 1 → step 2/3 transition: persist the NPS score + optional
 * comment. For low scores (< 9) also fire the internal owner email.
 */
export async function submitNps(input: {
  reviewRequestId: string;
  score: number;
  comment: string;
}): Promise<Result> {
  const review = await getReviewIfMine(input.reviewRequestId);
  if (!review) return { ok: false, error: "review not found" };
  if (review.npsScore !== null) {
    return { ok: false, error: "score already submitted" };
  }
  if (
    !Number.isFinite(input.score) ||
    input.score < 0 ||
    input.score > 10
  ) {
    return { ok: false, error: "score must be 0-10" };
  }

  const admin = createAdminSupabase();
  const trimmed = input.comment.trim();
  const { error } = await admin
    .from("review_requests")
    .update({
      nps_score: Math.round(input.score),
      nps_comment: trimmed || null,
      status: "responded",
      responded_at: new Date().toISOString(),
    })
    .eq("id", review.id);
  if (error) return { ok: false, error: error.message };

  // Detractor / passive: send the internal feedback email. We don't
  // block on the email — the client should see step 3 instantly.
  if (input.score < 9) {
    void sendInternalNpsFeedback({
      tenantId: review.tenantId,
      clientId: review.clientId,
      reviewRequestId: review.id,
      npsScore: Math.round(input.score),
      comment: trimmed || null,
    }).catch((e) => {
      console.warn("[submitNps] internal email failed:", e);
    });
  }

  // Notify admins. Detractors (≤6) escalate to urgent so they show in
  // the home banner; everyone else is normal priority.
  try {
    const { data: cli } = await admin
      .from("clients")
      .select("full_name")
      .eq("id", review.clientId)
      .maybeSingle();
    const firstName =
      ((cli?.full_name as string | null) ?? "")
        .trim()
        .split(/\s+/)[0] || "A client";
    const adminIds = await getOwnerOrAdminUserIds(review.tenantId);
    for (const userId of adminIds) {
      await insertNotification({
        tenantId: review.tenantId,
        recipientUserId: userId,
        kind: "review_received",
        priority: input.score <= 6 ? "urgent" : "normal",
        title: `${firstName} left a ${Math.round(input.score)}/10`,
        body: trimmed || null,
        actionUrl: "/admin/reviews",
        payload: {
          review_request_id: review.id,
          nps_score: Math.round(input.score),
        },
        dedupeKey: `review_received:${review.id}`,
      });
    }
  } catch (e) {
    console.warn("[submitNps] notification failed:", e);
  }

  revalidatePath(`/portal/review/${review.id}`);
  revalidatePath("/admin/reviews");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Step 2 (high-score path): client tapped "Leave a Google review".
 * Mark the click; we'll show the "Did you post your review?" prompt
 * when they come back (no cron needed — the page reads the flag on
 * next render).
 */
export async function markGoogleClicked(
  reviewRequestId: string
): Promise<Result> {
  const review = await getReviewIfMine(reviewRequestId);
  if (!review) return { ok: false, error: "review not found" };
  if ((review.npsScore ?? 0) < 9) {
    return { ok: false, error: "score too low for Google flow" };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("review_requests")
    .update({
      google_review_clicked: true,
      status: "google_clicked",
    })
    .eq("id", review.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/portal/review/${review.id}`);
  return { ok: true };
}

/**
 * "Yes, I posted" — atomically issue the voucher + flip the client to
 * has_left_google_review. Idempotent against double-click.
 */
export async function confirmGoogleReview(
  reviewRequestId: string
): Promise<
  Result<{ voucherPct: number; voucherExpiresAt: string }>
> {
  const review = await getReviewIfMine(reviewRequestId);
  if (!review) return { ok: false, error: "review not found" };
  if ((review.npsScore ?? 0) < 9) {
    return { ok: false, error: "score too low for Google flow" };
  }
  if (review.googleReviewConfirmedAt) {
    return { ok: false, error: "already confirmed" };
  }
  const r = await issueGoogleReviewVoucher({
    tenantId: review.tenantId,
    clientId: review.clientId,
    reviewRequestId: review.id,
  });
  if (!r.ok) return { ok: false, error: r.error };

  // Notify admins of the posted review + voucher issuance.
  try {
    const admin = createAdminSupabase();
    const { data: cli } = await admin
      .from("clients")
      .select("full_name")
      .eq("id", review.clientId)
      .maybeSingle();
    const firstName =
      ((cli?.full_name as string | null) ?? "")
        .trim()
        .split(/\s+/)[0] || "A client";
    const adminIds = await getOwnerOrAdminUserIds(review.tenantId);
    for (const userId of adminIds) {
      await insertNotification({
        tenantId: review.tenantId,
        recipientUserId: userId,
        kind: "google_review_posted",
        priority: "normal",
        title: `${firstName} left a ${review.npsScore ?? 10}/10 and posted on Google · +${r.pct}% voucher issued`,
        actionUrl: "/admin/reviews",
        payload: { review_request_id: review.id, voucher_pct: r.pct },
        dedupeKey: `google_review:${review.id}`,
      });
    }
  } catch (e) {
    console.warn("[confirmGoogleReview] notification failed:", e);
  }

  revalidatePath(`/portal/review/${review.id}`);
  revalidatePath("/portal");
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    voucherPct: r.pct,
    voucherExpiresAt: r.expiresAt,
  };
}

/**
 * "Maybe later" or "Not yet" → status='dismissed'. Keeps the row but
 * removes the lingering "did you post?" prompt next time the client
 * visits the page.
 */
export async function dismissReviewRequest(
  reviewRequestId: string
): Promise<Result> {
  const review = await getReviewIfMine(reviewRequestId);
  if (!review) return { ok: false, error: "review not found" };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("review_requests")
    .update({ status: "dismissed" })
    .eq("id", review.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/portal/review/${review.id}`);
  return { ok: true };
}
