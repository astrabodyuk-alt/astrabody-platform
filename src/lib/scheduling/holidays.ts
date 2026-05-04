import "server-only";
import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BusyInterval {
  startMs: number;
  endMs: number;
  source: "closure" | "staff_time_off";
  reason: string | null;
}

export interface DateBlock {
  /** ISO YYYY-MM-DD */
  ymd: string;
  /** Day fully blocked (no slots at all). */
  fullDay: boolean;
  /** Partial busy intervals to merge into the resolver. Empty when fullDay is true. */
  intervals: BusyInterval[];
}

interface ClosureRow {
  starts_on: string;
  ends_on: string;
  is_all_day: boolean;
  partial_start: string | null;
  partial_end: string | null;
  service_id: string | null;
  reason: string | null;
}

interface StaffTimeOffRow {
  starts_on: string;
  ends_on: string;
  is_all_day: boolean;
  partial_start: string | null;
  partial_end: string | null;
  reason: string | null;
}

/**
 * Reads tenant_closures + staff_time_off and returns the busy state
 * for the requested date (tenant timezone). The resolver and the
 * booking write-time guard share this helper so the two paths can't
 * disagree on what's blocked.
 *
 *   - For tenant_closures: rows with service_id IS NULL apply to every
 *     service; rows with service_id = serviceId apply only to that
 *     service. Rows with a different service_id are filtered out by SQL.
 *   - All_day rows mark the whole date as fullDay → callers should
 *     short-circuit (no slots, no GCal call).
 *   - Partial rows produce a BusyInterval in absolute ms covering
 *     partial_start..partial_end on the requested date in the tz.
 */
export async function loadDateBlock(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    staffId: string;
    serviceId: string;
    ymd: string;
    tz: string;
  }
): Promise<DateBlock> {
  const { tenantId, staffId, serviceId, ymd, tz } = args;

  const [closuresRes, timeOffRes] = await Promise.all([
    supabase
      .from("tenant_closures")
      .select(
        "starts_on, ends_on, is_all_day, partial_start, partial_end, service_id, reason"
      )
      .eq("tenant_id", tenantId)
      .lte("starts_on", ymd)
      .gte("ends_on", ymd)
      .or(`service_id.is.null,service_id.eq.${serviceId}`),
    supabase
      .from("staff_time_off")
      .select(
        "starts_on, ends_on, is_all_day, partial_start, partial_end, reason"
      )
      .eq("tenant_id", tenantId)
      .eq("staff_id", staffId)
      .lte("starts_on", ymd)
      .gte("ends_on", ymd),
  ]);

  const closures = (closuresRes.data ?? []) as ClosureRow[];
  const timeOff = (timeOffRes.data ?? []) as StaffTimeOffRow[];

  const intervals: BusyInterval[] = [];

  for (const c of closures) {
    if (c.is_all_day) {
      return { ymd, fullDay: true, intervals: [] };
    }
    if (c.partial_start && c.partial_end) {
      const startMs = fromZonedTime(`${ymd}T${c.partial_start}`, tz).getTime();
      const endMs = fromZonedTime(`${ymd}T${c.partial_end}`, tz).getTime();
      intervals.push({
        startMs,
        endMs,
        source: "closure",
        reason: c.reason,
      });
    }
  }

  for (const t of timeOff) {
    if (t.is_all_day) {
      return { ymd, fullDay: true, intervals: [] };
    }
    if (t.partial_start && t.partial_end) {
      const startMs = fromZonedTime(`${ymd}T${t.partial_start}`, tz).getTime();
      const endMs = fromZonedTime(`${ymd}T${t.partial_end}`, tz).getTime();
      intervals.push({
        startMs,
        endMs,
        source: "staff_time_off",
        reason: t.reason,
      });
    }
  }

  return { ymd, fullDay: false, intervals };
}

/**
 * Write-time guard for createBookingAndIntent. Returns null if the slot
 * is fine, or a friendly error string if a closure or time-off block
 * has appeared since the slot was offered.
 */
export async function checkSlotAgainstBlocks(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    staffId: string;
    serviceId: string;
    startsAtMs: number;
    endsAtMs: number;
    tz: string;
  }
): Promise<string | null> {
  const { tenantId, staffId, serviceId, startsAtMs, endsAtMs, tz } = args;
  const ymd = new Date(startsAtMs).toLocaleDateString("en-CA", {
    timeZone: tz,
  });
  const block = await loadDateBlock(supabase, {
    tenantId,
    staffId,
    serviceId,
    ymd,
    tz,
  });
  if (block.fullDay) {
    return "studio is closed on that date — pick another day";
  }
  for (const i of block.intervals) {
    if (startsAtMs < i.endMs && endsAtMs > i.startMs) {
      return i.source === "closure"
        ? "studio is closed during that window — pick another time"
        : "practitioner is unavailable at that time — pick another slot";
    }
  }
  return null;
}
