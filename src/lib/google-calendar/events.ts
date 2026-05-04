import "server-only";
import { google } from "googleapis";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getOAuth2ClientForStaff } from "@/lib/google-calendar/oauth";

/**
 * Best-effort write of a confirmed booking to the staff member's Google
 * Calendar. Returns true if an event was created, false otherwise (no
 * integration, error, or staff missing).
 *
 * Booking confirmation is the source of truth — GCal is a sync target.
 * The caller in /api/bookings/[id]/confirm wraps this in try/catch so
 * a Google API failure never blocks the booking flip.
 *
 * Real implementation as of Prompt 8.
 */
export async function createEventForBooking(
  bookingId: string
): Promise<boolean> {
  const admin = createAdminSupabase();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, staff_id, client_id, service_id, resource_id, starts_at, ends_at, gcal_event_id"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || !booking.staff_id) return false;

  // Idempotent: if we already wrote the event, skip.
  if (booking.gcal_event_id) {
    return true;
  }

  const ctx = await getOAuth2ClientForStaff(booking.staff_id as string);
  if (!ctx) {
    console.info(
      "[gcal/events] booking",
      bookingId,
      "— no active GCal integration for staff, skipped (expected when staff hasn't connected)."
    );
    return false;
  }

  // Fetch related rows in parallel.
  const resourceQuery = booking.resource_id
    ? admin
        .from("service_resources")
        .select("name")
        .eq("id", booking.resource_id as string)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const [serviceR, staffR, clientR, tenantR, resourceR] = await Promise.all([
    admin.from("services").select("name").eq("id", booking.service_id).maybeSingle(),
    admin.from("staff").select("display_name, email").eq("id", booking.staff_id).maybeSingle(),
    admin.from("clients").select("full_name, email").eq("id", booking.client_id).maybeSingle(),
    admin.from("tenants").select("timezone").eq("id", booking.tenant_id).maybeSingle(),
    resourceQuery,
  ]);

  const service = serviceR.data as { name: string } | null;
  const staff = staffR.data as { display_name: string; email: string | null } | null;
  const client = clientR.data as { full_name: string | null; email: string | null } | null;
  const tenant = tenantR.data as { timezone: string } | null;
  const resource = resourceR.data as { name: string } | null;

  const baseSummary = service?.name ?? "Astrabody session";
  const summary = resource
    ? `${baseSummary} · ${resource.name} · with ${staff?.display_name ?? "Astrabody"}`
    : baseSummary;
  const clientLabel = client?.full_name?.trim() || client?.email || "Astrabody client";
  const description = `${clientLabel} · booked via Astrabody Platform`;
  const timeZone = tenant?.timezone ?? "Europe/London";

  const attendees: Array<{ email: string }> = [];
  if (client?.email) attendees.push({ email: client.email });
  if (staff?.email) attendees.push({ email: staff.email });

  try {
    const calendar = google.calendar({ version: "v3", auth: ctx.client });
    const res = await calendar.events.insert({
      calendarId: ctx.calendarId,
      sendUpdates: "none",
      requestBody: {
        summary,
        description,
        start: {
          dateTime: new Date(booking.starts_at as string).toISOString(),
          timeZone,
        },
        end: {
          dateTime: new Date(booking.ends_at as string).toISOString(),
          timeZone,
        },
        attendees: attendees.length > 0 ? attendees : undefined,
        reminders: { useDefault: true },
      },
    });

    const eventId = res.data.id;
    if (!eventId) {
      console.warn("[gcal/events] insert returned no id for booking", bookingId);
      return false;
    }

    await admin
      .from("bookings")
      .update({
        gcal_event_id: eventId,
        gcal_calendar_id: ctx.calendarId,
      })
      .eq("id", bookingId);

    return true;
  } catch (err) {
    console.warn(
      "[gcal/events] insert failed for booking",
      bookingId,
      "—",
      (err as Error).message
    );
    return false;
  }
}

/**
 * Patch the start + end of an existing GCal event for a booking. Used
 * by the client-side reschedule flow so the event ID stays stable
 * (preserves staff-side reminders, attendee status, history). No-op
 * when the booking has no GCal event id linked.
 */
export async function patchEventForBooking(
  bookingId: string
): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, tenant_id, staff_id, starts_at, ends_at, gcal_event_id, gcal_calendar_id"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || !booking.staff_id) return false;
  if (!booking.gcal_event_id) return false;

  const ctx = await getOAuth2ClientForStaff(booking.staff_id as string);
  if (!ctx) return false;

  const { data: tenantR } = await admin
    .from("tenants")
    .select("timezone")
    .eq("id", booking.tenant_id)
    .maybeSingle();
  const timeZone =
    (tenantR?.timezone as string | undefined) ?? "Europe/London";

  try {
    const calendar = google.calendar({ version: "v3", auth: ctx.client });
    await calendar.events.patch({
      calendarId:
        (booking.gcal_calendar_id as string | null) ?? ctx.calendarId,
      eventId: booking.gcal_event_id as string,
      sendUpdates: "all",
      requestBody: {
        start: {
          dateTime: new Date(booking.starts_at as string).toISOString(),
          timeZone,
        },
        end: {
          dateTime: new Date(booking.ends_at as string).toISOString(),
          timeZone,
        },
      },
    });
    return true;
  } catch (err) {
    console.warn(
      "[gcal/events] patch failed for booking",
      bookingId,
      "—",
      (err as Error).message
    );
    return false;
  }
}
