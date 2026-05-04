import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail, type EmailContext } from "./render";
import { sendOne } from "./resend";

const TZ = "Europe/London";

interface ChargeEmailInput {
  tenantId: string;
  bookingId: string;
  amountPence: number;
  policy: {
    cutoffHours: number;
    lateCancelPct: number;
    noshowPct: number;
  };
}

/**
 * Send the noshow_charged or late_cancel_charged template right after a
 * staff-side charge succeeds. Best-effort — failures are logged but
 * don't bubble back to the staff UI (they got the charge to land,
 * which is what matters; the email can be re-queued).
 */
export async function sendChargeNotificationEmail(
  slug: "noshow_charged" | "late_cancel_charged",
  input: ChargeEmailInput
): Promise<void> {
  const admin = createAdminSupabase();

  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", input.tenantId)
    .maybeSingle();

  const { data: tpl } = await admin
    .from("email_templates")
    .select("id, subject, body_md, is_active")
    .eq("tenant_id", input.tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (!tpl || !tpl.is_active) return;

  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, starts_at, client_id, " +
        "clients (full_name, email, card_brand, card_last4), " +
        "services (name), " +
        "staff:staff_id (display_name)"
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  const booking = bookingRaw as unknown as {
    id: string;
    starts_at: string;
    client_id: string;
    clients: unknown;
    services: unknown;
    staff: unknown;
  } | null;

  if (!booking) return;
  const cli = pickFirst<{
    full_name: string | null;
    email: string | null;
    card_brand: string | null;
    card_last4: string | null;
  }>(booking.clients);
  if (!cli?.email) return;
  const svc = pickFirst<{ name: string }>(booking.services);
  const stf = pickFirst<{ display_name: string }>(booking.staff);
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
      time: startsAt
        .toLocaleTimeString("en-GB", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: TZ,
        })
        .replace(/\s+/g, "")
        .toLowerCase(),
    },
    service: { name: svc?.name ?? "Session" },
    staff: {
      first_name: firstName(stf?.display_name ?? null),
      display_name: stf?.display_name ?? "",
    },
    tenant: { name: (tenant?.name as string | undefined) ?? "Astrabody" },
    charge: { amount: (input.amountPence / 100).toFixed(2) },
    card: { last4: cli.card_last4 ?? "••••" },
    policy: {
      cutoff_hours: String(input.policy.cutoffHours),
      late_cancel_pct: String(input.policy.lateCancelPct),
      noshow_pct: String(input.policy.noshowPct),
    },
  };

  const rendered = await renderEmail(
    tpl.subject as string,
    tpl.body_md as string,
    ctx
  );
  await sendOne({
    tenantId: input.tenantId,
    templateId: tpl.id as string,
    clientId: booking.client_id as string,
    toEmail: cli.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
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
