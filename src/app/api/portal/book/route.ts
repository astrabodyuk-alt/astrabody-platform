import { NextResponse } from "next/server";
import { getCurrentClient } from "@/lib/portal/queries";
import { getActiveServicesForCurrentTenant } from "@/lib/portal/booking-queries";
import { getActiveFlashSlotsForPortal } from "@/lib/flash-slots/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatDistanceToNowStrict } from "date-fns";

export const dynamic = "force-dynamic";

async function pickYourUsual(clientId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, service_id, staff_id, starts_at, status, " +
        "services (name, duration_min, price_pence, is_bookable), " +
        "staff:staff_id (display_name, is_active)"
    )
    .eq("client_id", clientId)
    .eq("status", "completed")
    .order("starts_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string; service_id: string; staff_id: string | null; starts_at: string;
    services: { name: string; duration_min: number; price_pence: number; is_bookable: boolean } | { name: string; duration_min: number; price_pence: number; is_bookable: boolean }[] | null;
    staff: { display_name: string; is_active: boolean } | { display_name: string; is_active: boolean }[] | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => {
    const svc = Array.isArray(r.services) ? r.services[0] : r.services;
    return !!svc && svc.is_bookable;
  });
  if (rows.length === 0) return null;

  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.service_id, (tally.get(r.service_id) ?? 0) + 1);
  const topId = [...tally.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topId) return null;

  const last = rows.find((r) => r.service_id === topId);
  if (!last) return null;
  const svc = Array.isArray(last.services) ? last.services[0] : last.services;
  const stf = Array.isArray(last.staff) ? last.staff[0] : last.staff;
  if (!svc) return null;

  return {
    serviceId: last.service_id,
    serviceName: svc.name,
    durationMin: svc.duration_min,
    pricePence: svc.price_pence,
    staffId: stf?.is_active ? last.staff_id : null,
    lastStaffName: stf?.display_name ?? null,
    lastBookedRelative: `${formatDistanceToNowStrict(new Date(last.starts_at))} ago`,
  };
}

export async function GET() {
  try {
    const me = await getCurrentClient().catch(() => null);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [services, flashSlots, yourUsual] = await Promise.all([
      getActiveServicesForCurrentTenant(),
      getActiveFlashSlotsForPortal().catch(() => []),
      pickYourUsual(me.id),
    ]);

    return NextResponse.json({ services, flashSlots, yourUsual });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
