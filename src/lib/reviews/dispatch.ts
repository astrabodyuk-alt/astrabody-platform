import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail, type EmailContext } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import {
  evaluateBookingForReviewTrigger,
  type ReviewTriggerReason,
} from "./eligibility";

const TZ = "Europe/London";

/**
 * Fire-and-forget review request for a freshly-completed booking.
 * Idempotent: the existing UNIQUE on review_requests.booking_id (from
 * migration 001) means a second call for the same booking turns into
 * a no-op INSERT.
 *
 * Caller (markBookingCompleted) doesn't await us — review requests are
 * a side effect, not a primary outcome. Failures are logged.
 */
export async function dispatchReviewRequestForBooking(
  bookingId: string
): Promise<{ sent: boolean; reason: ReviewTriggerReason | null; skipReason?: string }> {
  const eligibility = await evaluateBookingForReviewTrigger(bookingId);
  if (!eligibility.eligible || !eligibility.reason) {
    return {
      sent: false,
      reason: null,
      skipReason: eligibility.skipReason ?? undefined,
    };
  }

  const admin = createAdminSupabase();

  // Pull what we need to insert + render the email.
  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, client_id, starts_at, " +
        "clients (full_name, email), " +
        "services (name), " +
        "staff:staff_id (display_name)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  type RawBooking = {
    id: string;
    tenant_id: string;
    client_id: string;
    starts_at: string;
    clients: unknown;
    services: unknown;
    staff: unknown;
  };
  const booking = bookingRaw as unknown as RawBooking | null;
  if (!booking) {
    return { sent: false, reason: null, skipReason: "booking vanished" };
  }
  const cli = pickFirst<{ full_name: string | null; email: string | null }>(
    booking.clients
  );
  const svc = pickFirst<{ name: string }>(booking.services);
  const stf = pickFirst<{ display_name: string }>(booking.staff);

  // Insert (or upsert on the legacy UNIQUE booking_id).
  const { data: review, error: insertError } = await admin
    .from("review_requests")
    .upsert(
      {
        tenant_id: booking.tenant_id,
        client_id: booking.client_id,
        booking_id: booking.id,
        trigger_reason: eligibility.reason,
        status: "sent",
        channel: "email",
        sent_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" }
    )
    .select("id")
    .single();
  if (insertError || !review) {
    console.warn(
      "[dispatchReviewRequestForBooking] insert failed:",
      insertError
    );
    return { sent: false, reason: null, skipReason: "insert failed" };
  }

  // Stamp the cooldown clock.
  await admin
    .from("clients")
    .update({ last_review_request_at: new Date().toISOString() })
    .eq("id", booking.client_id);

  // Render + send the email if we have one.
  if (!cli?.email) {
    return { sent: false, reason: eligibility.reason, skipReason: "no email" };
  }
  const { data: tplRow } = await admin
    .from("email_templates")
    .select("id, subject, body_md, is_active")
    .eq("tenant_id", booking.tenant_id)
    .eq("slug", "review_request")
    .maybeSingle();
  if (!tplRow || !tplRow.is_active) {
    return {
      sent: false,
      reason: eligibility.reason,
      skipReason: "review_request template missing or paused",
    };
  }

  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name")
    .eq("id", booking.tenant_id)
    .maybeSingle();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://astrabody.co.uk";
  const startsAt = new Date(booking.starts_at);
  const ctx: EmailContext = {
    client: {
      first_name: firstName(cli.full_name),
      full_name: cli.full_name ?? "",
    },
    booking: {
      starts_at_friendly: startsAt.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: TZ,
      }),
    },
    service: { name: svc?.name ?? "your session" },
    staff: { first_name: firstName(stf?.display_name ?? null) },
    tenant: { name: (tenantRow?.name as string | undefined) ?? "Astrabody" },
    review: {
      id: review.id as string,
      url: `${baseUrl.replace(/\/$/, "")}/portal/review/${review.id}`,
    },
  };

  const rendered = await renderEmail(
    tplRow.subject as string,
    tplRow.body_md as string,
    ctx
  );
  await sendOne({
    tenantId: booking.tenant_id,
    templateId: tplRow.id as string,
    clientId: booking.client_id,
    toEmail: cli.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { sent: true, reason: eligibility.reason };
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function firstName(full: string | null): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}
