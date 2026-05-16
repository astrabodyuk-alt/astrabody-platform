import { NextResponse } from "next/server";
import { getCurrentClient, getLoyaltyAccount, getNextBooking } from "@/lib/portal/queries";
import { getActiveFlashSlotsForPortal } from "@/lib/flash-slots/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { startOfWeek, endOfWeek, getDay } from "date-fns";

export const runtime = "edge";   // ~50 ms cold start vs ~2-3 s for Node.js
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentClient().catch(() => null);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = await createServerSupabase();
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });

    const [
      loyalty,
      nextBooking,
      flashSlots,
      activePacksResult,
      upcomingBookingsResult,
      weekSessionsResult,
    ] = await Promise.all([
      getLoyaltyAccount(me.id),
      getNextBooking(me.id),
      getActiveFlashSlotsForPortal().catch(() => []),

      // Active session packs with service name
      supabase
        .from("client_packages")
        .select("id, sessions_total, sessions_remaining, services:service_id(name)")
        .eq("client_id", me.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3),

      // Next 3 confirmed upcoming bookings
      supabase
        .from("bookings")
        .select(
          "id, starts_at, " +
          "services:service_id(name, duration_min), " +
          "staff:staff_id(display_name)"
        )
        .eq("client_id", me.id)
        .eq("status", "confirmed")
        .gt("starts_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(3),

      // This week's sessions for the bar chart
      supabase
        .from("bookings")
        .select("starts_at")
        .eq("client_id", me.id)
        .in("status", ["confirmed", "completed"])
        .gte("starts_at", weekStart.toISOString())
        .lte("starts_at", weekEnd.toISOString()),
    ]);

    // Weekday counts Mon=0 … Sun=6
    const weekCounts = Array(7).fill(0) as number[];
    for (const b of (weekSessionsResult.data ?? []) as Array<{ starts_at: string }>) {
      const raw = getDay(new Date(b.starts_at)); // JS: 0=Sun
      const idx = raw === 0 ? 6 : raw - 1;       // remap: Mon=0 … Sun=6
      weekCounts[idx]++;
    }

    return NextResponse.json({
      clientId:         me.id,
      firstName:        me.firstName,
      loyalty,
      nextBooking,
      flashSlots,
      activePacks:      activePacksResult.data ?? [],
      upcomingBookings: upcomingBookingsResult.data ?? [],
      weekCounts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
