"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import { patchEventForBooking } from "@/lib/google-calendar/events";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TZ = "Europe/London";

interface OwnedBooking {
  id: string;
  tenantId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  resourceId: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
}

/**
 * Fetch a booking, gating by:
 *   - the current user owning the booking (via client_portal_links)
 *   - status='confirmed' (we don't move pending or completed)
 *   - starts_at > now() + tenant.reschedule_cutoff_hours
 *
 * Returns either the booking or a structured "why" so the page can
 * render the right copy.
 */
export async function getReschedulableBooking(
  bookingId: string
): Promise<
  | { ok: true; booking: OwnedBooking; cutoffHours: number }
  | { ok: false; reason: "no_session" | "not_yours" | "wrong_status" | "too_late"; cutoffHours: number }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: "no_session", cutoffHours: 1 };
  }

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) {
    return { ok: false, reason: "no_session", cutoffHours: 1 };
  }
  const clientId = link.client_id as string;

  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, client_id, staff_id, service_id, resource_id, starts_at, ends_at, status, notes"
    )
    .eq("id", bookingId)
    .maybeSingle();

  const booking = bookingRaw as unknown as
    | {
        id: string;
        tenant_id: string;
        client_id: string;
        staff_id: string;
        service_id: string;
        resource_id: string | null;
        starts_at: string;
        ends_at: string;
        status: string;
        notes: string | null;
      }
    | null;

  if (!booking || booking.client_id !== clientId) {
    return { ok: false, reason: "not_yours", cutoffHours: 1 };
  }

  // Read tenant cutoff.
  const { data: tenant } = await admin
    .from("tenants")
    .select("reschedule_cutoff_hours")
    .eq("id", booking.tenant_id)
    .maybeSingle();
  const cutoffHours =
    (tenant?.reschedule_cutoff_hours as number | undefined) ?? 1;

  if (booking.status !== "confirmed") {
    return { ok: false, reason: "wrong_status", cutoffHours };
  }

  const cutoffMs = cutoffHours * 3_600_000;
  if (new Date(booking.starts_at).getTime() - Date.now() < cutoffMs) {
    return { ok: false, reason: "too_late", cutoffHours };
  }

  return {
    ok: true,
    cutoffHours,
    booking: {
      id: booking.id,
      tenantId: booking.tenant_id,
      clientId: booking.client_id,
      staffId: booking.staff_id,
      serviceId: booking.service_id,
      resourceId: booking.resource_id,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      status: booking.status,
      notes: booking.notes,
    },
  };
}

/**
 * Move a confirmed booking to a new slot. Re-checks the cutoff every
 * call (so a slow user doesn't sneak past the window). The new slot
 * must be one of the slots returned by /api/availability for the same
 * service / staff / resource — the action layer doesn't recompute
 * availability, but does refuse to move into a slot that overlaps an
 * existing booking on the same resource or staff.
 */
export async function rescheduleBookingByClient(input: {
  bookingId: string;
  newStartsAtIso: string;
}): Promise<Result> {
  const gate = await getReschedulableBooking(input.bookingId);
  if (!gate.ok) {
    return { ok: false, error: gateErrorMessage(gate.reason) };
  }
  const { booking } = gate;

  const newStarts = new Date(input.newStartsAtIso);
  if (Number.isNaN(newStarts.getTime())) {
    return { ok: false, error: "invalid time" };
  }
  if (newStarts.getTime() <= Date.now()) {
    return { ok: false, error: "new time must be in the future" };
  }

  // Compute new ends_at by preserving the original duration.
  const durationMs =
    new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime();
  const newEnds = new Date(newStarts.getTime() + durationMs);

  const admin = createAdminSupabase();

  // Conflict checks — same staff, and same resource if set. Exclude this
  // booking itself so moving from one of its own neighbouring slots
  // doesn't false-positive.
  const { data: staffOverlap } = await admin
    .from("bookings")
    .select("id")
    .eq("staff_id", booking.staffId)
    .in("status", ["pending", "confirmed"])
    .neq("id", booking.id)
    .lt("starts_at", newEnds.toISOString())
    .gt("ends_at", newStarts.toISOString())
    .limit(1);
  if ((staffOverlap ?? []).length > 0) {
    return { ok: false, error: "that time clashes with another session" };
  }

  if (booking.resourceId) {
    const { data: resourceOverlap } = await admin
      .from("bookings")
      .select("id")
      .eq("resource_id", booking.resourceId)
      .in("status", ["pending", "confirmed"])
      .neq("id", booking.id)
      .lt("starts_at", newEnds.toISOString())
      .gt("ends_at", newStarts.toISOString())
      .limit(1);
    if ((resourceOverlap ?? []).length > 0) {
      return { ok: false, error: "that time is taken on this unit" };
    }
  }

  // Build the audit note before mutating so old times are preserved.
  const oldFriendly = formatFriendly(booking.startsAt);
  const newFriendly = formatFriendly(newStarts.toISOString());
  const auditLine = `Moved by client on ${formatStamp(new Date())} from ${oldFriendly.full} to ${newFriendly.full}`;
  const nextNotes = booking.notes
    ? `${booking.notes}\n${auditLine}`
    : auditLine;

  const { error: updateError } = await admin
    .from("bookings")
    .update({
      starts_at: newStarts.toISOString(),
      ends_at: newEnds.toISOString(),
      notes: nextNotes,
    })
    .eq("id", booking.id);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Best-effort GCal patch.
  try {
    await patchEventForBooking(booking.id);
  } catch (e) {
    console.warn("[rescheduleBookingByClient] gcal patch failed:", e);
  }

  // Best-effort confirmation email.
  try {
    await sendRescheduleEmail({
      tenantId: booking.tenantId,
      clientId: booking.clientId,
      bookingId: booking.id,
      oldStartsAtIso: booking.startsAt,
      newStartsAtIso: newStarts.toISOString(),
    });
  } catch (e) {
    console.warn("[rescheduleBookingByClient] email failed:", e);
  }

  revalidatePath("/portal");
  revalidatePath(`/portal/booking/${booking.id}/confirmed`);
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true };
}

// ---- helpers --------------------------------------------------------

function gateErrorMessage(
  reason: "no_session" | "not_yours" | "wrong_status" | "too_late"
): string {
  switch (reason) {
    case "no_session":
      return "Sign in first.";
    case "not_yours":
      return "This booking can't be moved.";
    case "wrong_status":
      return "This booking can't be moved.";
    case "too_late":
      return "Too late to reschedule.";
  }
}

function formatFriendly(iso: string): { full: string; date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
  const time = d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    })
    .replace(/\s+/g, "")
    .toLowerCase();
  return { full: `${date} at ${time}`, date, time };
}

function formatStamp(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

async function sendRescheduleEmail(input: {
  tenantId: string;
  clientId: string;
  bookingId: string;
  oldStartsAtIso: string;
  newStartsAtIso: string;
}): Promise<void> {
  const admin = createAdminSupabase();

  const [tplR, tenantR, bookingR] = await Promise.all([
    admin
      .from("email_templates")
      .select("id, subject, body_md, is_active")
      .eq("tenant_id", input.tenantId)
      .eq("slug", "rescheduled_by_client")
      .maybeSingle(),
    admin
      .from("tenants")
      .select("name")
      .eq("id", input.tenantId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select(
        "client_id, " +
          "clients (full_name, email), " +
          "services (name), " +
          "staff:staff_id (display_name)"
      )
      .eq("id", input.bookingId)
      .maybeSingle(),
  ]);

  const tpl = tplR.data as
    | { id: string; subject: string; body_md: string; is_active: boolean }
    | null;
  if (!tpl || !tpl.is_active) return;

  type Embed<T> = T | T[] | null;
  const booking = bookingR.data as unknown as
    | {
        client_id: string;
        clients: Embed<{ full_name: string | null; email: string | null }>;
        services: Embed<{ name: string }>;
        staff: Embed<{ display_name: string }>;
      }
    | null;
  if (!booking) return;
  const cli = pickFirst<{ full_name: string | null; email: string | null }>(
    booking.clients
  );
  if (!cli?.email) return;
  const svc = pickFirst<{ name: string }>(booking.services);
  const stf = pickFirst<{ display_name: string }>(booking.staff);

  const oldF = formatFriendly(input.oldStartsAtIso);
  const newF = formatFriendly(input.newStartsAtIso);

  const rendered = await renderEmail(tpl.subject, tpl.body_md, {
    client: {
      first_name: firstName(cli.full_name),
      full_name: cli.full_name ?? "",
    },
    service: { name: svc?.name ?? "your session" },
    staff: { first_name: firstName(stf?.display_name ?? null) },
    tenant: { name: (tenantR.data?.name as string | undefined) ?? "Astrabody" },
    old: { starts_at_friendly: oldF.date, time: oldF.time },
    new: { starts_at_friendly: newF.date, time: newF.time },
  });
  await sendOne({
    tenantId: input.tenantId,
    templateId: tpl.id,
    clientId: input.clientId,
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
