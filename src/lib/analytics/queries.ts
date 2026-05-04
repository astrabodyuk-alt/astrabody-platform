import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// ---------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------

export type AnalyticsPeriod = "30d" | "90d" | "ytd" | "all";

export interface PeriodWindow {
  /** Inclusive lower bound. */
  startIso: string;
  /** Exclusive upper bound. */
  endIso: string;
  /** Length in ms (∞ when period === "all"). */
  lengthMs: number;
  label: string;
}

export function resolvePeriod(period: AnalyticsPeriod): PeriodWindow {
  const now = Date.now();
  const endIso = new Date(now).toISOString();
  if (period === "30d") {
    const ms = 30 * 86_400_000;
    return {
      startIso: new Date(now - ms).toISOString(),
      endIso,
      lengthMs: ms,
      label: "Last 30 days",
    };
  }
  if (period === "90d") {
    const ms = 90 * 86_400_000;
    return {
      startIso: new Date(now - ms).toISOString(),
      endIso,
      lengthMs: ms,
      label: "Last 90 days",
    };
  }
  if (period === "ytd") {
    const start = new Date(new Date().getFullYear(), 0, 1).toISOString();
    return {
      startIso: start,
      endIso,
      lengthMs: now - new Date(start).getTime(),
      label: "This year",
    };
  }
  return {
    startIso: new Date(0).toISOString(),
    endIso,
    lengthMs: Number.POSITIVE_INFINITY,
    label: "All time",
  };
}

/** Same length as the active period, immediately preceding it. */
export function previousPeriod(period: PeriodWindow): PeriodWindow {
  if (!Number.isFinite(period.lengthMs)) {
    return { ...period }; // "all time" has no comparable previous window.
  }
  const startMs = new Date(period.startIso).getTime();
  return {
    startIso: new Date(startMs - period.lengthMs).toISOString(),
    endIso: period.startIso,
    lengthMs: period.lengthMs,
    label: "Previous period",
  };
}

interface BookingSlim {
  id: string;
  client_id: string;
  service_id: string;
  status: string;
  starts_at: string;
  price_pence: number | null;
}

async function fetchBookingsInWindow(
  tenantId: string,
  window: PeriodWindow
): Promise<BookingSlim[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bookings")
    .select("id, client_id, service_id, status, starts_at, price_pence")
    .eq("tenant_id", tenantId)
    .gte("starts_at", window.startIso)
    .lt("starts_at", window.endIso);
  return (data ?? []) as BookingSlim[];
}

// ---------------------------------------------------------------
// KPI metrics — each returns a comparable shape for the StatCard
// ---------------------------------------------------------------

export interface KpiMetric {
  label: string;
  /** Pre-formatted display value, ready for the StatCard. */
  value: string;
  /** Raw numeric value — used for the trend % calc. */
  current: number;
  previous: number;
  /** Change vs previous period (1 = +100%). */
  delta: number | null;
  /** When true, a *decrease* is good (no-show rate). */
  inverse?: boolean;
}

export interface KpiBundle {
  avgBookingValue: KpiMetric;
  repeatRate: KpiMetric;
  noShowRate: KpiMetric;
  revenuePerClient: KpiMetric;
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function uniqueClientIds(rows: BookingSlim[]): Set<string> {
  return new Set(rows.map((r) => r.client_id));
}

export async function getKpiBundle(
  tenantId: string,
  period: PeriodWindow
): Promise<KpiBundle> {
  const previous = previousPeriod(period);
  const [current, prev] = await Promise.all([
    fetchBookingsInWindow(tenantId, period),
    Number.isFinite(previous.lengthMs)
      ? fetchBookingsInWindow(tenantId, previous)
      : Promise.resolve([] as BookingSlim[]),
  ]);

  const completedCurrent = current.filter((b) => b.status === "completed");
  const completedPrev = prev.filter((b) => b.status === "completed");

  const avgCurrent = avg(
    completedCurrent.map((b) => (b.price_pence as number | null) ?? 0)
  );
  const avgPrev = avg(
    completedPrev.map((b) => (b.price_pence as number | null) ?? 0)
  );

  const clientsCurrent = uniqueClientIds(current);
  const clientsPrev = uniqueClientIds(prev);
  const repeatCountCurrent = countRepeatClients(current);
  const repeatCountPrev = countRepeatClients(prev);
  const repeatRateCurrent =
    clientsCurrent.size === 0 ? 0 : repeatCountCurrent / clientsCurrent.size;
  const repeatRatePrev =
    clientsPrev.size === 0 ? 0 : repeatCountPrev / clientsPrev.size;

  const noShowCurrent = noShowRate(current);
  const noShowPrev = noShowRate(prev);

  const revenueCurrent = completedCurrent.reduce(
    (acc, b) => acc + ((b.price_pence as number | null) ?? 0),
    0
  );
  const revenuePrev = completedPrev.reduce(
    (acc, b) => acc + ((b.price_pence as number | null) ?? 0),
    0
  );
  const completedClientsCurrent = uniqueClientIds(completedCurrent);
  const completedClientsPrev = uniqueClientIds(completedPrev);
  const revPerClientCurrent =
    completedClientsCurrent.size === 0
      ? 0
      : revenueCurrent / completedClientsCurrent.size;
  const revPerClientPrev =
    completedClientsPrev.size === 0
      ? 0
      : revenuePrev / completedClientsPrev.size;

  return {
    avgBookingValue: {
      label: "Avg. booking value",
      value: formatPence(avgCurrent),
      current: avgCurrent,
      previous: avgPrev,
      delta: pct(avgCurrent, avgPrev),
    },
    repeatRate: {
      label: "Repeat client rate",
      value: formatPercent(repeatRateCurrent),
      current: repeatRateCurrent,
      previous: repeatRatePrev,
      delta: pct(repeatRateCurrent, repeatRatePrev),
    },
    noShowRate: {
      label: "No-show rate",
      value: formatPercent(noShowCurrent),
      current: noShowCurrent,
      previous: noShowPrev,
      delta: pct(noShowCurrent, noShowPrev),
      inverse: true,
    },
    revenuePerClient: {
      label: "Revenue per client",
      value: formatPence(revPerClientCurrent),
      current: revPerClientCurrent,
      previous: revPerClientPrev,
      delta: pct(revPerClientCurrent, revPerClientPrev),
    },
  };
}

function countRepeatClients(rows: BookingSlim[]): number {
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.client_id, (tally.get(r.client_id) ?? 0) + 1);
  let n = 0;
  for (const c of tally.values()) if (c >= 2) n++;
  return n;
}

function noShowRate(rows: BookingSlim[]): number {
  let denom = 0;
  let no = 0;
  for (const r of rows) {
    if (r.status === "no_show") {
      no++;
      denom++;
    } else if (r.status === "completed" || r.status === "cancelled") {
      denom++;
    }
  }
  if (denom === 0) return 0;
  return no / denom;
}

function formatPence(pence: number): string {
  const pounds = pence / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: pounds >= 100 ? 0 : 2,
  }).format(pounds);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface FunnelResult {
  stages: FunnelStage[];
  /**
   * Estimated GBP "left on the table" by no-shows in the period —
   * avg_completed_price × no_show_count × 0.5. Used by the insight
   * card.
   */
  estimatedNoShowLossPence: number;
  /** Index of the biggest drop-off (stage N → N+1). */
  biggestDropFromIdx: number;
}

export async function getFunnel(
  tenantId: string,
  period: PeriodWindow
): Promise<FunnelResult> {
  const admin = createAdminSupabase();

  const newClientsRes = await admin
    .from("clients")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", period.startIso)
    .lt("created_at", period.endIso);
  const newClients = (newClientsRes.data ?? []) as Array<{
    id: string;
    created_at: string;
  }>;

  // For each new client, look up their bookings (only first ones we
  // need — but a single fetch keeps the round-trip count low).
  const newClientIds = newClients.map((c) => c.id);
  let firstBookingClients = new Set<string>();
  let firstCompletedClients = new Set<string>();

  if (newClientIds.length > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select("client_id, status, starts_at, created_at")
      .eq("tenant_id", tenantId)
      .in("client_id", newClientIds);
    type Row = {
      client_id: string;
      status: string;
      starts_at: string;
      created_at: string;
    };
    const byClient = new Map<string, Row[]>();
    for (const r of (rows ?? []) as Row[]) {
      const arr = byClient.get(r.client_id) ?? [];
      arr.push(r);
      byClient.set(r.client_id, arr);
    }

    for (const c of newClients) {
      const cutoff = new Date(c.created_at).getTime() + 14 * 86_400_000;
      const list = byClient.get(c.id) ?? [];
      const within14 = list.find(
        (b) => new Date(b.created_at).getTime() <= cutoff
      );
      if (within14) firstBookingClients.add(c.id);
      const completed = list.find((b) => b.status === "completed");
      if (completed) firstCompletedClients.add(c.id);
    }
  }

  // Stage 4 — second completed booking ever (lifecycle, not windowed).
  let returnedClients = new Set<string>();
  if (firstCompletedClients.size > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select("client_id")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("client_id", Array.from(firstCompletedClients));
    const tally = new Map<string, number>();
    for (const r of (rows ?? []) as Array<{ client_id: string }>) {
      tally.set(r.client_id, (tally.get(r.client_id) ?? 0) + 1);
    }
    for (const [id, n] of tally) {
      if (n >= 2) returnedClients.add(id);
    }
  }

  // Stage 5 — package purchased of those who returned.
  let withPackClients = new Set<string>();
  if (returnedClients.size > 0) {
    const { data: rows } = await admin
      .from("client_packages")
      .select("client_id")
      .eq("tenant_id", tenantId)
      .in("client_id", Array.from(returnedClients));
    for (const r of (rows ?? []) as Array<{ client_id: string }>) {
      withPackClients.add(r.client_id);
    }
  }

  // Stage 6 — active regulars: all clients with 3+ completed bookings
  // in the trailing 90 days. NOT scoped to "new this period".
  const ninetyAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: regularRows } = await admin
    .from("bookings")
    .select("client_id")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("starts_at", ninetyAgo);
  const regTally = new Map<string, number>();
  for (const r of (regularRows ?? []) as Array<{ client_id: string }>) {
    regTally.set(r.client_id, (regTally.get(r.client_id) ?? 0) + 1);
  }
  let activeRegulars = 0;
  for (const n of regTally.values()) if (n >= 3) activeRegulars++;

  const stages: FunnelStage[] = [
    { key: "new_clients", label: "New clients", count: newClients.length },
    {
      key: "first_booking",
      label: "First booking made",
      count: firstBookingClients.size,
    },
    {
      key: "first_completed",
      label: "First booking completed",
      count: firstCompletedClients.size,
    },
    {
      key: "returned",
      label: "Returned (2nd visit)",
      count: returnedClients.size,
    },
    {
      key: "package_purchased",
      label: "Package purchased",
      count: withPackClients.size,
    },
    {
      key: "active_regulars",
      label: "Active regulars (last 90 days)",
      count: activeRegulars,
    },
  ];

  // Biggest drop-off — among adjacent pairs, the largest absolute drop.
  let biggestDrop = -1;
  let biggestIdx = 0;
  for (let i = 0; i < stages.length - 1; i++) {
    const drop = stages[i].count - stages[i + 1].count;
    if (drop > biggestDrop) {
      biggestDrop = drop;
      biggestIdx = i;
    }
  }

  // No-show loss estimate over the period.
  const periodBookings = await fetchBookingsInWindow(tenantId, period);
  const completedRows = periodBookings.filter((b) => b.status === "completed");
  const avgCompletedPence = avg(
    completedRows.map((b) => (b.price_pence as number | null) ?? 0)
  );
  const noShowCount = periodBookings.filter((b) => b.status === "no_show").length;
  const estimatedNoShowLossPence = Math.round(
    avgCompletedPence * noShowCount * 0.5
  );

  return {
    stages,
    estimatedNoShowLossPence,
    biggestDropFromIdx: biggestIdx,
  };
}

// ---------------------------------------------------------------
// Retention heatmap — last 12 weeks × 7 days, completed bookings
// ---------------------------------------------------------------

export interface HeatmapCell {
  ymd: string;
  count: number;
}

export interface HeatmapResult {
  /** Outer index = week (0 = most recent), inner index = day (0=Mon..6=Sun). */
  weeks: HeatmapCell[][];
}

export async function getRetentionHeatmap(
  tenantId: string
): Promise<HeatmapResult> {
  const admin = createAdminSupabase();
  // 12 weeks back from the start of the current week (Mon).
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0 = Mon
  const thisMonday = new Date(today);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(today.getDate() - dow);
  const startMonday = new Date(thisMonday);
  startMonday.setDate(thisMonday.getDate() - 7 * 11); // 12 rows total
  const start = startMonday.toISOString();

  const { data } = await admin
    .from("bookings")
    .select("starts_at, status")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("starts_at", start);

  // Bucket by ymd in tenant tz (Europe/London by V1 default).
  const tally = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ starts_at: string }>) {
    const ymd = new Date(r.starts_at).toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
    tally.set(ymd, (tally.get(ymd) ?? 0) + 1);
  }

  const weeks: HeatmapCell[][] = [];
  for (let w = 0; w < 12; w++) {
    const row: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(thisMonday);
      cellDate.setDate(thisMonday.getDate() - w * 7 + d);
      const ymd = cellDate.toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      });
      row.push({ ymd, count: tally.get(ymd) ?? 0 });
    }
    weeks.push(row);
  }
  return { weeks };
}

// ---------------------------------------------------------------
// Top services + Top clients
// ---------------------------------------------------------------

export interface TopServiceRow {
  serviceId: string;
  name: string;
  sessions: number;
  revenuePence: number;
  avgTicketPence: number;
}

export async function getTopServices(
  tenantId: string,
  period: PeriodWindow
): Promise<TopServiceRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bookings")
    .select(
      "service_id, price_pence, services (name)"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("starts_at", period.startIso)
    .lt("starts_at", period.endIso);

  type Row = {
    service_id: string;
    price_pence: number | null;
    services: { name: string } | { name: string }[] | null;
  };
  const tally = new Map<
    string,
    { sessions: number; revenue: number; name: string }
  >();
  for (const r of ((data ?? []) as unknown) as Row[]) {
    const name = Array.isArray(r.services) ? r.services[0]?.name : r.services?.name;
    const cur = tally.get(r.service_id) ?? {
      sessions: 0,
      revenue: 0,
      name: name ?? "Service",
    };
    cur.sessions++;
    cur.revenue += r.price_pence ?? 0;
    tally.set(r.service_id, cur);
  }

  return Array.from(tally.entries())
    .map(([id, v]) => ({
      serviceId: id,
      name: v.name,
      sessions: v.sessions,
      revenuePence: v.revenue,
      avgTicketPence: v.sessions === 0 ? 0 : Math.round(v.revenue / v.sessions),
    }))
    .sort((a, b) => b.revenuePence - a.revenuePence)
    .slice(0, 5);
}

export interface TopClientRow {
  clientId: string;
  fullName: string;
  sessions: number;
  totalSpentPence: number;
  lastVisit: string | null;
}

export async function getTopClients(
  tenantId: string,
  period: PeriodWindow
): Promise<TopClientRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("bookings")
    .select(
      "client_id, price_pence, starts_at, clients (full_name)"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("starts_at", period.startIso)
    .lt("starts_at", period.endIso);

  type Row = {
    client_id: string;
    price_pence: number | null;
    starts_at: string;
    clients: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const tally = new Map<
    string,
    {
      sessions: number;
      totalSpent: number;
      lastVisit: string | null;
      fullName: string;
    }
  >();
  for (const r of ((data ?? []) as unknown) as Row[]) {
    const name = Array.isArray(r.clients)
      ? r.clients[0]?.full_name
      : r.clients?.full_name;
    const cur = tally.get(r.client_id) ?? {
      sessions: 0,
      totalSpent: 0,
      lastVisit: null,
      fullName: name ?? "Client",
    };
    cur.sessions++;
    cur.totalSpent += r.price_pence ?? 0;
    if (!cur.lastVisit || r.starts_at > cur.lastVisit) cur.lastVisit = r.starts_at;
    tally.set(r.client_id, cur);
  }

  return Array.from(tally.entries())
    .map(([id, v]) => ({
      clientId: id,
      fullName: v.fullName,
      sessions: v.sessions,
      totalSpentPence: v.totalSpent,
      lastVisit: v.lastVisit,
    }))
    .sort((a, b) => b.totalSpentPence - a.totalSpentPence)
    .slice(0, 10);
}

// ---------------------------------------------------------------
// Win-back candidates (always all-time)
// ---------------------------------------------------------------

export interface WinBackRow {
  clientId: string;
  fullName: string;
  totalSessions: number;
  totalSpentPence: number;
  lastBookingAt: string;
  daysLapsed: number;
}

export async function getWinBackCandidates(
  tenantId: string
): Promise<WinBackRow[]> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const { data: clients } = await admin
    .from("clients")
    .select("id, full_name, last_booking_at, total_spend_pence, bookings_count")
    .eq("tenant_id", tenantId)
    .lt("last_booking_at", cutoff)
    .gte("bookings_count", 2)
    .order("total_spend_pence", { ascending: false })
    .limit(50);

  type Row = {
    id: string;
    full_name: string | null;
    last_booking_at: string | null;
    total_spend_pence: number | null;
    bookings_count: number | null;
  };
  return ((clients ?? []) as Row[])
    .filter((c) => !!c.last_booking_at)
    .map((c) => {
      const last = new Date(c.last_booking_at as string);
      return {
        clientId: c.id,
        fullName: c.full_name ?? "Client",
        totalSessions: c.bookings_count ?? 0,
        totalSpentPence: c.total_spend_pence ?? 0,
        lastBookingAt: c.last_booking_at as string,
        daysLapsed: Math.max(
          0,
          Math.floor((Date.now() - last.getTime()) / 86_400_000)
        ),
      };
    });
}
