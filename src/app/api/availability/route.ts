import { NextResponse, type NextRequest } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  getServiceDetail,
  getDefaultStaffForService,
} from "@/lib/portal/booking-queries";
import { getFreeBusyForStaff } from "@/lib/google-calendar/freebusy";
import { loadDateBlock } from "@/lib/scheduling/holidays";

/**
 * GET /api/availability?serviceId=...&date=YYYY-MM-DD&staffId=<uuid|any>&resourceId=<uuid>
 *
 * Computes 30-min start increments where the service fits cleanly:
 *   service.duration_min + service.buffer_min, inside working_hours,
 *   not overlapping time_off, existing bookings (staff or resource),
 *   or GCal busy.
 *
 * staffId behaviour:
 *   - omitted or "any" → default staff.
 *   - <uuid>           → specific staff (validated via staff_services).
 *
 * resourceId behaviour:
 *   - <uuid>  → return slots where this specific resource is free
 *               (still gated by staff availability above).
 *   - omitted → if the service has 1+ active resources, return slots
 *               where AT LEAST ONE resource is free, with a per-slot
 *               list of free resource ids in `availableResources`.
 *               Services with no resources behave exactly like before.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId");
  const date = url.searchParams.get("date");
  const staffIdParam = url.searchParams.get("staffId");
  const resourceIdParam = url.searchParams.get("resourceId");

  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "missing or invalid serviceId / date" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const service = await getServiceDetail(serviceId);
  if (!service) {
    return NextResponse.json({ error: "service not found" }, { status: 404 });
  }

  let staff: { id: string; display_name: string; email: string | null } | null = null;
  if (staffIdParam && staffIdParam !== "any") {
    const { data: link } = await supabase
      .from("staff_services")
      .select("staff:staff_id (id, display_name, email, is_active)")
      .eq("service_id", serviceId)
      .eq("staff_id", staffIdParam)
      .maybeSingle();
    type Embed = {
      staff:
        | { id: string; display_name: string; email: string | null; is_active: boolean }
        | Array<{ id: string; display_name: string; email: string | null; is_active: boolean }>
        | null;
    };
    const embed = link as Embed | null;
    const row = embed
      ? Array.isArray(embed.staff)
        ? embed.staff[0]
        : embed.staff
      : null;
    if (!row || !row.is_active) {
      return NextResponse.json(
        { error: "staff not assigned to this service" },
        { status: 400 }
      );
    }
    staff = { id: row.id, display_name: row.display_name, email: row.email };
  } else {
    staff = await getDefaultStaffForService(serviceId);
  }

  if (!staff) {
    return NextResponse.json({ slots: [], staffId: null, staffName: null });
  }

  // Pull the active resources for this service. When 0 → flag null and
  // skip resource bookkeeping (current behaviour preserved).
  const { data: resourceRows } = await supabase
    .from("service_resources")
    .select("id")
    .eq("service_id", serviceId)
    .eq("is_active", true);
  const allResourceIds = ((resourceRows ?? []) as Array<{ id: string }>).map(
    (r) => r.id
  );
  const filterResourceId =
    resourceIdParam && allResourceIds.includes(resourceIdParam)
      ? resourceIdParam
      : null;

  const tz = "Europe/London";
  const result = await computeSlots({
    tenantId: service.tenant_id,
    serviceId,
    serviceDurationMin: service.duration_min,
    serviceBufferMin: service.buffer_min,
    staffId: staff.id,
    date,
    tz,
    allResourceIds,
    filterResourceId,
  });

  return NextResponse.json({
    slots: result.slots,
    perSlotResources: result.perSlotResources,
    staffId: staff.id,
    staffName: staff.display_name,
    staffEmail: staff.email,
  });
}

interface SlotComputeArgs {
  tenantId: string;
  serviceId: string;
  serviceDurationMin: number;
  serviceBufferMin: number;
  staffId: string;
  date: string;
  tz: string;
  allResourceIds: string[];
  filterResourceId: string | null;
}

interface SlotComputeResult {
  slots: string[];
  /** Map of slot ISO → free resource ids. Empty when service has no resources. */
  perSlotResources: Record<string, string[]>;
}

async function computeSlots(args: SlotComputeArgs): Promise<SlotComputeResult> {
  const supabase = await createServerSupabase();
  const {
    tenantId,
    serviceId,
    serviceDurationMin,
    serviceBufferMin,
    staffId,
    date,
    tz,
    allResourceIds,
    filterResourceId,
  } = args;

  const dayStart = fromZonedTime(`${date}T00:00:00`, tz);
  const dayEnd = fromZonedTime(`${date}T23:59:59.999`, tz);

  // Closures + staff time-off override everything: when the day is
  // fully blocked we don't even hit GCal, saves the freebusy quota.
  const dateBlock = await loadDateBlock(supabase, {
    tenantId,
    staffId,
    serviceId,
    ymd: date,
    tz,
  });
  if (dateBlock.fullDay) {
    return { slots: [], perSlotResources: {} };
  }

  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const { data: hours } = await supabase
    .from("working_hours")
    .select("start_time, end_time")
    .eq("staff_id", staffId)
    .eq("weekday", weekday);
  if (!hours || hours.length === 0)
    return { slots: [], perSlotResources: {} };

  const { data: timeOff } = await supabase
    .from("time_off")
    .select("starts_at, ends_at")
    .eq("staff_id", staffId)
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());

  // Service-role for cross-client booking overlaps (privacy preserved
  // because we only return start timestamps, never raw bookings).
  const admin = createAdminSupabase();
  const { data: staffBookings } = await admin
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("staff_id", staffId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());

  // Resource-side bookings: read all bookings for the service's
  // resources today so we can per-slot check which resource is free.
  let resourceBookings: Array<{
    resource_id: string;
    starts_at: string;
    ends_at: string;
  }> = [];
  if (allResourceIds.length > 0) {
    const { data } = await admin
      .from("bookings")
      .select("resource_id, starts_at, ends_at")
      .in("resource_id", allResourceIds)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", dayEnd.toISOString())
      .gt("ends_at", dayStart.toISOString());
    resourceBookings = (data ?? []) as Array<{
      resource_id: string;
      starts_at: string;
      ends_at: string;
    }>;
  }

  let freebusy: Array<{ start: string; end: string }> = [];
  try {
    freebusy = await getFreeBusyForStaff(staffId, dayStart, dayEnd);
  } catch (err) {
    console.warn("[availability] gcal freebusy skipped:", err);
  }

  type Interval = [number, number];
  const staffBusy: Interval[] = [
    ...((timeOff ?? []) as Array<{ starts_at: string; ends_at: string }>).map(
      (t): Interval => [
        new Date(t.starts_at).getTime(),
        new Date(t.ends_at).getTime(),
      ]
    ),
    ...((staffBookings ?? []) as Array<{ starts_at: string; ends_at: string }>).map(
      (b): Interval => [
        new Date(b.starts_at).getTime(),
        new Date(b.ends_at).getTime(),
      ]
    ),
    ...freebusy.map(
      (f): Interval => [new Date(f.start).getTime(), new Date(f.end).getTime()]
    ),
    ...dateBlock.intervals.map((i): Interval => [i.startMs, i.endMs]),
  ];

  // Bucket resource bookings by resource_id so per-slot lookup is O(1).
  const byResource = new Map<string, Interval[]>();
  for (const id of allResourceIds) byResource.set(id, []);
  for (const r of resourceBookings) {
    if (!r.resource_id) continue;
    const arr = byResource.get(r.resource_id) ?? [];
    arr.push([new Date(r.starts_at).getTime(), new Date(r.ends_at).getTime()]);
    byResource.set(r.resource_id, arr);
  }

  const slotMinutes = 30;
  const totalNeededMs = (serviceDurationMin + serviceBufferMin) * 60_000;
  const slotStepMs = slotMinutes * 60_000;
  const nowMs = Date.now();

  const slots: string[] = [];
  const perSlotResources: Record<string, string[]> = {};

  for (const h of hours as Array<{ start_time: string; end_time: string }>) {
    const winStart = fromZonedTime(`${date}T${h.start_time}`, tz).getTime();
    const winEnd = fromZonedTime(`${date}T${h.end_time}`, tz).getTime();

    let cursor = winStart;
    while (cursor + totalNeededMs <= winEnd) {
      if (cursor < nowMs) {
        cursor += slotStepMs;
        continue;
      }
      const slotEnd = cursor + totalNeededMs;
      const staffOverlap = staffBusy.some(
        ([bs, be]) => cursor < be && slotEnd > bs
      );
      if (staffOverlap) {
        cursor += slotStepMs;
        continue;
      }

      // Per-resource availability check.
      if (allResourceIds.length === 0) {
        slots.push(new Date(cursor).toISOString());
      } else {
        const free: string[] = [];
        for (const id of allResourceIds) {
          if (filterResourceId && id !== filterResourceId) continue;
          const intervals = byResource.get(id) ?? [];
          const overlap = intervals.some(
            ([bs, be]) => cursor < be && slotEnd > bs
          );
          if (!overlap) free.push(id);
        }
        if (free.length > 0) {
          const iso = new Date(cursor).toISOString();
          slots.push(iso);
          perSlotResources[iso] = free;
        }
      }

      cursor += slotStepMs;
    }
  }

  return { slots, perSlotResources };
}
