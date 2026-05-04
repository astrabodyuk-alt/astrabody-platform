"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";
import { chargeSavedCard } from "@/lib/stripe/charge-saved";
import {
  getCancellationPolicyAdmin,
  isLateCancellation,
  lateCancelChargePence,
  noshowChargePence,
} from "@/lib/finance/policy";
import { sendChargeNotificationEmail } from "@/lib/email/charge-emails";
import { dispatchReviewRequestForBooking } from "@/lib/reviews/dispatch";
import {
  insertNotification,
  getOwnerUserIds,
} from "@/lib/notifications/insert";

/**
 * Cancel a booking. Staff (any tenant_member) can cancel any booking
 * in their tenant. The optional `chargeLateFee` flag triggers an
 * off-session card charge if (a) the booking is inside the policy
 * cutoff window AND (b) the client has a card on file. Outside the
 * window, the cancel is free.
 *
 * Returns the charge result so the UI can surface a Stripe error
 * inline when the card is declined.
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string,
  chargeLateFee?: boolean
): Promise<
  | { ok: true; lateFeeChargedPence?: number }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const admin = createAdminSupabase();

  // If asked to charge a late fee, do it BEFORE flipping status — we
  // want to fail loudly on the charge before recording the cancel.
  let lateFeePence = 0;
  if (chargeLateFee) {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, tenant_id, client_id, starts_at, price_pence, status")
      .eq("id", bookingId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!booking) return { ok: false, error: "booking not found" };
    if (booking.status !== "confirmed" && booking.status !== "pending") {
      return { ok: false, error: "this booking can't be cancelled" };
    }
    const policy = await getCancellationPolicyAdmin(ctx.tenantId);
    if (!policy.enabled) {
      return { ok: false, error: "cancellation policy is disabled" };
    }
    if (!isLateCancellation(new Date(booking.starts_at as string), policy)) {
      return {
        ok: false,
        error: "this booking is outside the late-cancel window",
      };
    }
    const amountPence = lateCancelChargePence(
      (booking.price_pence as number) ?? 0,
      policy
    );
    if (amountPence > 0) {
      const charge = await chargeSavedCard({
        tenantId: ctx.tenantId,
        clientId: booking.client_id as string,
        amountPence,
        description: `Late cancellation fee — booking ${bookingId}`,
        metadata: {
          astrabody_booking_id: bookingId,
          astrabody_charge_kind: "late_cancel",
        },
      });
      if (!charge.ok) {
        return {
          ok: false,
          error: `Charge failed: ${charge.error}`,
        };
      }
      lateFeePence = charge.amountPence;

      // Owner notification for the late-cancel charge.
      const { data: cli } = await admin
        .from("clients")
        .select("full_name")
        .eq("id", booking.client_id as string)
        .maybeSingle();
      const firstName =
        ((cli?.full_name as string | null) ?? "")
          .trim()
          .split(/\s+/)[0] || "the client";
      const ownerIds = await getOwnerUserIds(ctx.tenantId);
      for (const userId of ownerIds) {
        await insertNotification({
          tenantId: ctx.tenantId,
          recipientUserId: userId,
          kind: "late_cancel_charged",
          priority: "normal",
          title: `${firstName} was charged ${formatGbpInline(charge.amountPence)} for a late cancellation`,
          actionUrl: `/admin/bookings?focus=${bookingId}`,
          payload: {
            booking_id: bookingId,
            amount_pence: charge.amountPence,
          },
          dedupeKey: `late_cancel:${bookingId}`,
        });
      }

      // Best-effort email — don't block cancel on a stuck SMTP.
      try {
        await sendChargeNotificationEmail("late_cancel_charged", {
          tenantId: ctx.tenantId,
          bookingId,
          amountPence: charge.amountPence,
          policy: {
            cutoffHours: policy.lateCancelCutoffHours,
            lateCancelPct: policy.lateCancelChargePct,
            noshowPct: policy.noshowChargePct,
          },
        });
      } catch (e) {
        console.warn("[cancelBooking] late-cancel email failed:", e);
      }
    }
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason?.trim() || null,
    })
    .eq("id", bookingId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  // Slot just opened — fan out the waitlist notify hook so the first
  // eligible client on the list gets a WhatsApp message.
  void notifyWaitlistFromBooking(bookingId, ctx.tenantId);

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return lateFeePence > 0
    ? { ok: true, lateFeeChargedPence: lateFeePence }
    : { ok: true };
}

async function notifyWaitlistFromBooking(
  bookingId: string,
  tenantId: string
): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: row } = await admin
      .from("bookings")
      .select("service_id, staff_id, starts_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (!row) return;
    const freedDate =
      typeof row.starts_at === "string"
        ? row.starts_at.slice(0, 10)
        : null;
    if (!freedDate || !row.service_id) return;
    const { notifyWaitlistForSlot } = await import("@/lib/waitlist/actions");
    await notifyWaitlistForSlot({
      tenantId,
      serviceId: row.service_id as string,
      freedDate,
      freedStaffId: (row.staff_id as string | null) ?? null,
    });
  } catch (err) {
    console.warn("[cancelBooking] waitlist notify failed", err);
  }
}

/**
 * Mark a booking as no-show + charge the client's saved card per the
 * tenant's cancellation policy. Staff can override the auto-computed
 * amount (helpful for goodwill / mistakes). Reason is appended to
 * bookings.notes for audit.
 *
 * Off-session charges can fail (card declined, requires_action). On
 * failure we leave the booking status alone so staff can retry, and
 * we surface the error inline.
 */
export async function markBookingNoShow(input: {
  bookingId: string;
  amountPence: number;
  reason?: string;
}): Promise<
  | { ok: true; chargedPence: number; paymentIntentId: string }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!Number.isFinite(input.amountPence) || input.amountPence <= 0) {
    return { ok: false, error: "amount must be positive" };
  }

  const admin = createAdminSupabase();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, tenant_id, client_id, status, notes, price_pence, starts_at")
    .eq("id", input.bookingId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "booking not found" };
  if (booking.status === "no_show") {
    return { ok: false, error: "already marked no-show" };
  }
  if (booking.status === "cancelled") {
    return { ok: false, error: "this booking was cancelled" };
  }

  const policy = await getCancellationPolicyAdmin(ctx.tenantId);

  const charge = await chargeSavedCard({
    tenantId: ctx.tenantId,
    clientId: booking.client_id as string,
    amountPence: Math.round(input.amountPence),
    description: `No-show charge — booking ${input.bookingId}`,
    metadata: {
      astrabody_booking_id: input.bookingId,
      astrabody_charge_kind: "no_show",
    },
  });

  const reasonTrim = input.reason?.trim();
  const noteSuffix = reasonTrim ? `\nNo-show reason: ${reasonTrim}` : "";

  // Resolve client first-name for notification title (best-effort).
  const { data: clientRow } = await admin
    .from("clients")
    .select("full_name")
    .eq("id", booking.client_id as string)
    .maybeSingle();
  const clientFirstName =
    ((clientRow?.full_name as string | null) ?? "").trim().split(/\s+/)[0] ||
    "the client";

  if (!charge.ok) {
    // Persist the failure into notes so the staff can audit.
    const failureNote = `\nNo-show charge attempt failed at ${new Date().toISOString()}: ${charge.error}${noteSuffix}`;
    await admin
      .from("bookings")
      .update({
        notes: ((booking.notes as string | null) ?? "") + failureNote,
      })
      .eq("id", input.bookingId);

    // Urgent notification → owners. Visible in the bell + home banner.
    const ownerIds = await getOwnerUserIds(ctx.tenantId);
    for (const userId of ownerIds) {
      await insertNotification({
        tenantId: ctx.tenantId,
        recipientUserId: userId,
        kind: "noshow_charge_failed",
        priority: "urgent",
        title: `Card charge failed for ${clientFirstName}'s no-show — needs your action`,
        body: `${charge.error}. The booking is still in the previous state; you can retry or contact ${clientFirstName}.`,
        actionUrl: `/admin/bookings?focus=${input.bookingId}`,
        payload: { booking_id: input.bookingId, error: charge.error },
        dedupeKey: `noshow_fail:${input.bookingId}`,
      });
    }
    return { ok: false, error: charge.error };
  }

  // Success: flip to no_show + write the charge audit columns.
  await admin
    .from("bookings")
    .update({
      status: "no_show",
      noshow_charged_amount_pence: charge.amountPence,
      noshow_charged_at: new Date().toISOString(),
      noshow_payment_intent_id: charge.paymentIntentId,
      notes: ((booking.notes as string | null) ?? "") + noteSuffix,
    })
    .eq("id", input.bookingId);

  // Notify owners of the successful charge (normal priority).
  const ownerIds = await getOwnerUserIds(ctx.tenantId);
  for (const userId of ownerIds) {
    await insertNotification({
      tenantId: ctx.tenantId,
      recipientUserId: userId,
      kind: "noshow_charged",
      priority: "normal",
      title: `${clientFirstName} was charged ${formatGbpInline(charge.amountPence)} for missing today's session`,
      body: null,
      actionUrl: `/admin/bookings?focus=${input.bookingId}`,
      payload: {
        booking_id: input.bookingId,
        amount_pence: charge.amountPence,
      },
      dedupeKey: `noshow_ok:${input.bookingId}`,
    });
  }

  // Best-effort confirmation email.
  try {
    await sendChargeNotificationEmail("noshow_charged", {
      tenantId: ctx.tenantId,
      bookingId: input.bookingId,
      amountPence: charge.amountPence,
      policy: {
        cutoffHours: policy.lateCancelCutoffHours,
        lateCancelPct: policy.lateCancelChargePct,
        noshowPct: policy.noshowChargePct,
      },
    });
  } catch (e) {
    console.warn("[markBookingNoShow] confirmation email failed:", e);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  return {
    ok: true,
    chargedPence: charge.amountPence,
    paymentIntentId: charge.paymentIntentId,
  };
}

/**
 * Read the auto-computed default no-show amount for a booking so the
 * client UI can pre-fill the modal input before staff confirms.
 */
export async function getNoShowDefault(
  bookingId: string
): Promise<
  | {
      ok: true;
      defaultPence: number;
      pricePence: number;
      noshowPct: number;
      hasCardOnFile: boolean;
    }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const admin = createAdminSupabase();
  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, price_pence, " +
        "clients (default_payment_method_id)"
    )
    .eq("id", bookingId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  const booking = bookingRaw as unknown as {
    id: string;
    tenant_id: string;
    price_pence: number;
    clients:
      | { default_payment_method_id: string | null }
      | { default_payment_method_id: string | null }[]
      | null;
  } | null;
  if (!booking) return { ok: false, error: "booking not found" };
  const cli = pickFirst<{ default_payment_method_id: string | null }>(
    booking.clients
  );
  const policy = await getCancellationPolicyAdmin(ctx.tenantId);
  return {
    ok: true,
    defaultPence: noshowChargePence(booking.price_pence ?? 0, policy),
    pricePence: booking.price_pence ?? 0,
    noshowPct: policy.noshowChargePct,
    hasCardOnFile: !!cli?.default_payment_method_id,
  };
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function formatGbpInline(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Mark a booking as completed. Triggers the loyalty earn rule
 * separately (not wired in V1 — see Antigravity Prompt 10).
 */
export async function markBookingCompleted(
  bookingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", bookingId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  // Fire-and-forget review request: cooldown / Google-review-already
  // / milestone gating all live inside the dispatcher. We don't await
  // because the staff just want the status flip to feel instant.
  dispatchReviewRequestForBooking(bookingId).catch((e) => {
    console.warn("[markBookingCompleted] review dispatch failed:", e);
  });

  // Credit loyalty points. Uses the admin (service-role) client because
  // loyalty_ledger INSERT is gated to service_role in RLS.
  // The SQL function is idempotent — calling it twice is safe.
  createAdminSupabase()
    .rpc("loyalty_credit_booking", { p_booking: bookingId })
    .then(({ error: loyaltyErr }) => {
      if (loyaltyErr) {
        console.warn("[markBookingCompleted] loyalty credit failed:", loyaltyErr.message);
      }
    });

  // If this booking belongs to a referred client whose referral is
  // still in 'converted' state, mark it rewarded and credit the
  // referrer. Idempotent.
  void rewardOnCompletion(bookingId, ctx.tenantId);

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true };
}

async function rewardOnCompletion(
  bookingId: string,
  tenantId: string
): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: booking } = await admin
      .from("bookings")
      .select("client_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking?.client_id) return;
    const { rewardReferrerOnCompletion } = await import(
      "@/lib/referrals/actions"
    );
    await rewardReferrerOnCompletion({
      tenantId,
      referredClientId: booking.client_id as string,
    });
  } catch (err) {
    console.warn("[markBookingCompleted] referral reward failed", err);
  }
}

/**
 * Re-point the "Sold by" attribution on a booking. Owner/admin only.
 * Updates bookings.sold_by_staff_id AND the matching commissions row's
 * staff_id (snapshot rate + amount stay as they were — owner can edit
 * the commission row directly if a different amount is wanted).
 */
export async function updateBookingSoldBy(
  bookingId: string,
  newStaffId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();

  // Validate staff is in this tenant.
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id, is_active")
    .eq("id", newStaffId)
    .maybeSingle();
  if (!staff || staff.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "staff not in your tenant" };
  }

  const { error: bookingErr } = await admin
    .from("bookings")
    .update({ sold_by_staff_id: newStaffId })
    .eq("id", bookingId)
    .eq("tenant_id", ctx.tenantId);
  if (bookingErr) return { ok: false, error: bookingErr.message };

  // Re-point the (possibly already-issued) commission row. Skip if paid
  // — paid commissions are immutable for accounting reasons.
  await admin
    .from("commissions")
    .update({ staff_id: newStaffId })
    .eq("booking_id", bookingId)
    .neq("status", "paid");

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/me");
  return { ok: true };
}
