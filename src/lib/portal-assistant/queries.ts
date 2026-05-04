import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentClient, getLoyaltyAccount } from "@/lib/portal/queries";
import type {
  PortalAssistantContext,
  ServiceLite,
  PackCatalogueRow,
  ActivePackRow,
  UpcomingBookingRow,
  RecentBookingRow,
  WorkingHoursRow,
} from "./types";

/**
 * One-shot context fetch the assistant uses to ground every reply.
 * Runs every database query in parallel — typical latency 200–400ms
 * including a slow Supavisor cold start. The shape mirrors the system
 * prompt's expectations exactly.
 */
export async function getPortalAssistantContext(): Promise<PortalAssistantContext | null> {
  let me;
  try {
    me = await getCurrentClient();
  } catch {
    return null;
  }
  const tenantId = me.tenant_id;
  const clientId = me.id;

  const admin = createAdminSupabase();
  const nowIso = new Date().toISOString();

  const [
    tenantRes,
    servicesRes,
    packsCatRes,
    activePacksRes,
    upcomingRes,
    recentRes,
    giftCardsRes,
    workingHoursRes,
    loyaltyAcct,
  ] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "name, timezone, loyalty_double_points_until"
      )
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("services")
      .select("id, name, duration_min, price_pence, is_bookable")
      .eq("tenant_id", tenantId)
      .eq("is_bookable", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("service_packages")
      .select(
        "id, name, sessions_count, price_pence, is_active, services:service_id (name)"
      )
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("client_packages")
      .select(
        "sessions_total, sessions_remaining, expires_at, services:service_id (name)"
      )
      .eq("client_id", clientId)
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .gt("sessions_remaining", 0)
      .order("expires_at", { ascending: true }),
    admin
      .from("bookings")
      .select(
        "starts_at, status, services (name), staff:staff_id (display_name)"
      )
      .eq("client_id", clientId)
      .gte("starts_at", nowIso)
      .in("status", ["pending", "confirmed"])
      .order("starts_at", { ascending: true })
      .limit(5),
    admin
      .from("bookings")
      .select(
        "starts_at, services (name), staff:staff_id (display_name)"
      )
      .eq("client_id", clientId)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(10),
    admin
      .from("gift_cards")
      .select("balance_pence, voided_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("purchased_by", clientId)
      .gt("balance_pence", 0),
    admin
      .from("working_hours")
      .select("weekday, start_time, end_time")
      .eq("tenant_id", tenantId),
    getLoyaltyAccount(clientId).catch(() => null),
  ]);

  // ---- Tenant -----------------------------------------------------
  const tenant = tenantRes.data as
    | { name: string; timezone: string; loyalty_double_points_until: string | null }
    | null;
  const tenantName = tenant?.name ?? "the studio";
  const tenantTimezone = tenant?.timezone ?? "Europe/London";

  // ---- Services ---------------------------------------------------
  const services: ServiceLite[] = (
    (servicesRes.data ?? []) as Array<{
      id: string;
      name: string;
      duration_min: number;
      price_pence: number;
    }>
  ).map((s) => ({
    id: s.id,
    name: s.name,
    durationMin: s.duration_min,
    pricePence: s.price_pence,
  }));

  // ---- Pack catalogue --------------------------------------------
  const packCatalogue: PackCatalogueRow[] = (
    (packsCatRes.data ?? []) as unknown as Array<{
      id: string;
      name: string;
      sessions_count: number;
      price_pence: number;
      services: { name: string } | { name: string }[] | null;
    }>
  ).map((p) => {
    const svc = Array.isArray(p.services) ? p.services[0] : p.services;
    return {
      id: p.id,
      name: p.name,
      serviceName: svc?.name ?? "Service",
      sessions: p.sessions_count,
      pricePence: p.price_pence,
    };
  });

  // ---- Active packs ----------------------------------------------
  const activePacks: ActivePackRow[] = (
    (activePacksRes.data ?? []) as unknown as Array<{
      sessions_total: number;
      sessions_remaining: number;
      expires_at: string;
      services: { name: string } | { name: string }[] | null;
    }>
  ).map((p) => {
    const svc = Array.isArray(p.services) ? p.services[0] : p.services;
    return {
      serviceName: svc?.name ?? "Service",
      sessionsRemaining: p.sessions_remaining,
      totalSessions: p.sessions_total,
      expiresAt: p.expires_at,
    };
  });

  // ---- Upcoming + recent bookings --------------------------------
  const upcomingBookings: UpcomingBookingRow[] = (
    (upcomingRes.data ?? []) as unknown as Array<{
      starts_at: string;
      status: string;
      services: { name: string } | { name: string }[] | null;
      staff: { display_name: string } | { display_name: string }[] | null;
    }>
  ).map((b) => {
    const svc = Array.isArray(b.services) ? b.services[0] : b.services;
    const stf = Array.isArray(b.staff) ? b.staff[0] : b.staff;
    return {
      serviceName: svc?.name ?? "Session",
      staffName: stf?.display_name ?? "the team",
      startsAt: b.starts_at,
      status: b.status,
    };
  });

  const recentBookings: RecentBookingRow[] = (
    (recentRes.data ?? []) as unknown as Array<{
      starts_at: string;
      services: { name: string } | { name: string }[] | null;
      staff: { display_name: string } | { display_name: string }[] | null;
    }>
  ).map((b) => {
    const svc = Array.isArray(b.services) ? b.services[0] : b.services;
    const stf = Array.isArray(b.staff) ? b.staff[0] : b.staff;
    return {
      serviceName: svc?.name ?? "Session",
      staffName: stf?.display_name ?? "the team",
      completedAt: b.starts_at,
    };
  });

  // ---- Gift card balance -----------------------------------------
  const giftCardBalance = ((giftCardsRes.data ?? []) as Array<{
    balance_pence: number;
    voided_at: string | null;
    expires_at: string;
  }>)
    .filter(
      (g) =>
        !g.voided_at && new Date(g.expires_at).getTime() > Date.now()
    )
    .reduce((acc, g) => acc + g.balance_pence, 0);

  // ---- Loyalty ---------------------------------------------------
  const loyaltyPoints = loyaltyAcct?.currentPoints ?? 0;
  const loyaltyTierName = loyaltyAcct?.tier
    ? prettyTier(loyaltyAcct.tier)
    : null;

  // ---- Active promotions -----------------------------------------
  const activePromotions: string[] = [];
  const dpu = tenant?.loyalty_double_points_until;
  if (dpu && new Date(dpu).getTime() > Date.now()) {
    const ends = new Date(dpu).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
    });
    activePromotions.push(`Double points until ${ends}`);
  }

  // ---- Working hours --------------------------------------------
  // working_hours is per-staff. Aggregate to a single tenant-level
  // open / close window per weekday: earliest open, latest close.
  type WhRow = { weekday: number; start_time: string; end_time: string };
  const whByDow = new Map<number, { open: string; close: string }>();
  for (const r of (workingHoursRes.data ?? []) as WhRow[]) {
    const cur = whByDow.get(r.weekday);
    if (!cur) {
      whByDow.set(r.weekday, { open: r.start_time, close: r.end_time });
      continue;
    }
    if (r.start_time < cur.open) cur.open = r.start_time;
    if (r.end_time > cur.close) cur.close = r.end_time;
  }
  const workingHours: WorkingHoursRow[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const w = whByDow.get(dow);
    workingHours.push({
      dayOfWeek: dow,
      openTime: w ? w.open.slice(0, 5) : null,
      closeTime: w ? w.close.slice(0, 5) : null,
      isClosed: !w,
    });
  }

  return {
    clientId,
    tenantId,
    clientName: me.firstName,
    tenantName,
    tenantTimezone,
    studioPhone: process.env.NEXT_PUBLIC_STUDIO_PHONE ?? null,
    studioAddress: process.env.NEXT_PUBLIC_STUDIO_ADDRESS ?? null,
    services,
    packCatalogue,
    activePacks,
    upcomingBookings,
    recentBookings,
    loyaltyPoints,
    loyaltyTierName,
    giftCardBalance,
    activePromotions,
    workingHours,
  };
}

function prettyTier(tier: string): string {
  switch (tier) {
    case "inner_circle":
      return "Inner Circle";
    case "insider":
      return "Insider";
    case "friend":
      return "Friend";
    default:
      return tier;
  }
}
