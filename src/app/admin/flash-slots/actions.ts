"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";

export type CreateFlashSlotInput = {
  serviceId: string;
  staffId: string | null;
  slotStart: string;    // ISO datetime
  slotEnd: string;      // ISO datetime
  flashPricePence: number;
  originalPricePence: number;
  label: string;
  description: string | null;
  maxClaims: number;
};

export type FlashSlotResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createFlashSlot(
  input: CreateFlashSlotInput
): Promise<FlashSlotResult> {
  const session = await getAdminContext();
  if (!session) return { ok: false, error: "Not authenticated" };

  const { tenantId } = session;
  const admin = createAdminSupabase();

  // Validate service belongs to tenant
  const { data: svc } = await admin
    .from("services")
    .select("id, price_pence")
    .eq("id", input.serviceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!svc) return { ok: false, error: "Service not found" };

  // Validate staff belongs to tenant (if specified)
  if (input.staffId) {
    const { data: stf } = await admin
      .from("staff")
      .select("id")
      .eq("id", input.staffId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!stf) return { ok: false, error: "Staff not found" };
  }

  // expires_at = slot_start (deal expires when the slot begins)
  const expiresAt = input.slotStart;

  const { data, error } = await admin
    .from("flash_slots")
    .insert({
      tenant_id: tenantId,
      service_id: input.serviceId,
      staff_id: input.staffId,
      slot_start: input.slotStart,
      slot_end: input.slotEnd,
      flash_price_pence: input.flashPricePence,
      original_price_pence: input.originalPricePence,
      label: input.label,
      description: input.description,
      max_claims: input.maxClaims,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[createFlashSlot]", error);
    return { ok: false, error: "Failed to create flash slot" };
  }

  revalidatePath("/admin/flash-slots");
  revalidatePath("/portal");
  return { ok: true, id: data.id as string };
}

export async function cancelFlashSlot(flashSlotId: string): Promise<FlashSlotResult> {
  const session = await getAdminContext();
  if (!session) return { ok: false, error: "Not authenticated" };

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("flash_slots")
    .update({ status: "cancelled" })
    .eq("id", flashSlotId)
    .eq("tenant_id", session.tenantId);

  if (error) return { ok: false, error: "Failed to cancel" };

  revalidatePath("/admin/flash-slots");
  revalidatePath("/portal");
  return { ok: true, id: flashSlotId };
}

/**
 * Scan today's schedule and return suggested flash slot windows.
 * A "suggestion" = a contiguous free gap of ≥ service_duration_min minutes.
 */
export async function getFlashSuggestions(tenantId: string) {
  const admin = createAdminSupabase();

  // 1. Get today's working hours for the tenant (use schedule/working_hours)
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0]; // YYYY-MM-DD
  // Day of week 0=Sun…6=Sat
  const dow = now.getDay();
  const dowMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const dayKey = dowMap[dow]!;

  const { data: schedule } = await admin
    .from("working_hours")
    .select("start_time, end_time")
    .eq("tenant_id", tenantId)
    .eq("day_of_week", dayKey)
    .eq("is_open", true)
    .maybeSingle();

  if (!schedule) return []; // Closed today

  // Parse working hours as today's timestamps
  const [sh, sm] = (schedule.start_time as string).split(":").map(Number);
  const [eh, em] = (schedule.end_time as string).split(":").map(Number);
  const todayStart = new Date(now);
  todayStart.setHours(sh!, sm!, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(eh!, em!, 0, 0);

  // If we're past closing, no suggestions
  if (now >= todayEnd) return [];

  // Effective window starts at max(now + 1h, todayStart) so suggestions are ≥1h away
  const windowStart = new Date(Math.max(now.getTime() + 60 * 60 * 1000, todayStart.getTime()));

  // 2. Get today's confirmed/pending bookings for all staff
  const { data: bookings } = await admin
    .from("bookings")
    .select("starts_at, ends_at, service_id, services:service_id (name, duration_min)")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "pending"])
    .gte("starts_at", todayIso + "T00:00:00Z")
    .lt("starts_at", todayIso + "T23:59:59Z")
    .order("starts_at", { ascending: true });

  // 3. Get bookable services (for context)
  const { data: services } = await admin
    .from("services")
    .select("id, name, price_pence, duration_min")
    .eq("tenant_id", tenantId)
    .eq("is_bookable", true)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // 4. Find free gaps
  type Gap = { start: Date; end: Date; durationMin: number };
  const occupied = ((bookings ?? []) as Array<{ starts_at: string; ends_at: string }>)
    .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }))
    .filter((b) => b.end > windowStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: Gap[] = [];
  let cursor = windowStart;

  for (const block of occupied) {
    if (block.start > cursor) {
      const dur = (block.start.getTime() - cursor.getTime()) / 60000;
      if (dur >= 30) {
        gaps.push({ start: cursor, end: block.start, durationMin: Math.floor(dur) });
      }
    }
    cursor = block.end > cursor ? block.end : cursor;
  }
  // Gap after last booking
  if (cursor < todayEnd) {
    const dur = (todayEnd.getTime() - cursor.getTime()) / 60000;
    if (dur >= 30) {
      gaps.push({ start: cursor, end: todayEnd, durationMin: Math.floor(dur) });
    }
  }

  // 5. For each gap, suggest which services fit
  type Suggestion = {
    gapStart: string;
    gapEnd: string;
    gapDurationMin: number;
    services: Array<{ id: string; name: string; durationMin: number; pricePence: number }>;
  };

  const suggestions: Suggestion[] = gaps.map((gap) => ({
    gapStart: gap.start.toISOString(),
    gapEnd: gap.end.toISOString(),
    gapDurationMin: gap.durationMin,
    services: ((services ?? []) as Array<{ id: string; name: string; duration_min: number; price_pence: number }>)
      .filter((s) => s.duration_min <= gap.durationMin)
      .map((s) => ({ id: s.id, name: s.name, durationMin: s.duration_min, pricePence: s.price_pence })),
  })).filter((s) => s.services.length > 0);

  return suggestions;
}
