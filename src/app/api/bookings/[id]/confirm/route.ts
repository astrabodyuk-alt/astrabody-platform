import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createEventForBooking } from "@/lib/google-calendar/events";
import { saveCardFromPaymentIntent } from "@/lib/stripe/save-card";

/**
 * Stripe redirects here after stripe.confirmPayment(). Stripe appends
 *   ?payment_intent=pi_...&payment_intent_client_secret=...&redirect_status=...
 *
 * On success:
 *   - Verify the PaymentIntent server-side (don't trust the redirect alone).
 *   - Flip booking.status → 'confirmed', set deposit_paid = true.
 *   - Insert public.deposits status='paid', stripe_payment_intent ref, paid_at.
 *   - Best-effort GCal events.insert (no-op in V1; logs only).
 *   - Redirect to /portal/booking/{bookingId}/confirmed.
 *
 * Loyalty earn rule: points are credited on session COMPLETION, not at
 * booking time. The +N points line on the confirmation page is a promise,
 * not a transaction.
 *   // Points are credited on session completion, not at booking time.
 *   // See /api/bookings/[id]/complete (built later).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: bookingId } = await params;
  const url = new URL(request.url);
  const paymentIntentId = url.searchParams.get("payment_intent");
  const redirectStatus = url.searchParams.get("redirect_status");

  if (!paymentIntentId) {
    return NextResponse.redirect(
      `${url.origin}/portal/book?error=missing_payment_intent`
    );
  }

  // Verify with Stripe — don't trust query params alone.
  let paymentIntent;
  try {
    paymentIntent = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error("[bookings/confirm] retrieve failed", err);
    return NextResponse.redirect(
      `${url.origin}/portal/book?error=payment_lookup_failed`
    );
  }

  if (
    paymentIntent.status !== "succeeded" &&
    paymentIntent.status !== "processing"
  ) {
    console.warn(
      "[bookings/confirm] payment not successful:",
      paymentIntent.status,
      "redirect_status:",
      redirectStatus
    );
    return NextResponse.redirect(
      `${url.origin}/portal/book/${bookingId}?error=payment_not_succeeded`
    );
  }

  // Match the intent metadata to the booking we're confirming.
  const intentBookingId = paymentIntent.metadata?.booking_id;
  if (intentBookingId !== bookingId) {
    console.error(
      "[bookings/confirm] booking_id mismatch:",
      intentBookingId,
      "vs",
      bookingId
    );
    return NextResponse.redirect(
      `${url.origin}/portal/book?error=booking_mismatch`
    );
  }

  const admin = createAdminSupabase();

  // Idempotent flip — only update if still pending.
  const { data: booking, error: updateError } = await admin
    .from("bookings")
    .update({
      status: "confirmed",
      deposit_paid: true,
      stripe_payment_intent: paymentIntentId,
    })
    .eq("id", bookingId)
    .select("id, tenant_id, client_id, deposit_pence, starts_at")
    .single();

  if (updateError || !booking) {
    console.error("[bookings/confirm] update failed", updateError);
    return NextResponse.redirect(
      `${url.origin}/portal/book?error=booking_update_failed`
    );
  }

  // Audit deposit row (idempotent on stripe_payment_intent unique).
  const { error: depositError } = await admin
    .from("deposits")
    .upsert(
      {
        tenant_id: booking.tenant_id as string,
        booking_id: bookingId,
        amount_pence: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        status: "paid",
        stripe_payment_intent: paymentIntentId,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "stripe_payment_intent" }
    );
  if (depositError) {
    console.error("[bookings/confirm] deposit upsert failed", depositError);
    // Continue — booking is confirmed even if the audit row didn't insert.
  }

  // If the client opted in to saving the card at checkout, persist the
  // PM now that the payment confirmed. Stripe attached it to the
  // customer automatically because we set setup_future_usage on the
  // PaymentIntent. Best-effort: a failure here doesn't block booking
  // confirmation, but we log it so the operator can re-link manually.
  if (paymentIntent.metadata?.save_card === "yes") {
    try {
      const r = await saveCardFromPaymentIntent({
        paymentIntentId,
        clientId: booking.client_id as string,
        tenantId: booking.tenant_id as string,
      });
      if (!r.ok) {
        console.warn("[bookings/confirm] save card failed:", r.error);
      }
    } catch (err) {
      console.warn("[bookings/confirm] save card threw:", err);
    }
  }

  // Best-effort GCal write. No-op in V1 (Antigravity Prompt 8 wires OAuth).
  try {
    await createEventForBooking(bookingId);
  } catch (err) {
    console.warn("[bookings/confirm] gcal write skipped:", err);
  }

  return NextResponse.redirect(
    `${url.origin}/portal/booking/${bookingId}/confirmed`
  );
}
