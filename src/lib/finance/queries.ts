import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { createServerSupabase } from "@/lib/supabase/server";
import { sumVat, type VatSplit } from "./vat";

const TZ = "Europe/London";

export interface TenantVatSettings {
  registered: boolean;
  ratePct: number;
  number: string | null;
}

export interface RevenuePoint {
  /** YYYY-MM */
  monthIso: string;
  /** Short month label "Jan", "Feb", etc — for chart axis. */
  label: string;
  ttcPence: number;
  exVatPence: number;
  vatPence: number;
  /** Number of revenue-bearing rows (bookings + package purchases). */
  count: number;
}

export interface FinanceKpis {
  thisMonth: VatSplit & { count: number };
  lastMonth: VatSplit & { count: number };
  sameMonthLastYear: (VatSplit & { count: number }) | null;
  hasYearOfHistory: boolean;
}

/**
 * Read a tenant's VAT settings. Used everywhere we display money on
 * the finance page. Returns sensible defaults if missing.
 */
export async function getTenantVatSettings(
  tenantId: string
): Promise<TenantVatSettings> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("vat_registered, vat_rate_pct, vat_number")
    .eq("id", tenantId)
    .maybeSingle();
  return {
    registered: (data?.vat_registered as boolean | undefined) ?? false,
    ratePct: Number((data?.vat_rate_pct as number | undefined) ?? 20),
    number: (data?.vat_number as string | undefined) ?? null,
  };
}

/**
 * Pull every revenue-bearing transaction for a tenant in a window:
 *   - bookings.price_pence where status in ('confirmed','completed')
 *     and starts_at in window. We use starts_at (the fulfilment date)
 *     because that's when revenue is "earned" for accounting purposes,
 *     not when the booking was created.
 *   - package_purchases.amount_paid_pence where created_at in window
 *     and not refunded. Packs are paid in advance so the cash hits the
 *     period it was sold in.
 *
 * Returns the raw pence values — VAT splitting is the caller's job
 * via sumVat() / splitVat().
 */
async function fetchRevenuePencesForRange(
  tenantId: string,
  startIso: string,
  endIso: string
): Promise<{ pences: number[]; count: number }> {
  const supabase = await createServerSupabase();
  const [bookingsResult, purchasesResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("price_pence")
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("starts_at", startIso)
      .lt("starts_at", endIso),
    supabase
      .from("package_purchases")
      .select("amount_paid_pence")
      .eq("tenant_id", tenantId)
      .eq("refunded", false)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);
  const bookings = (bookingsResult.data ?? []) as Array<{ price_pence: number }>;
  const purchases = (purchasesResult.data ?? []) as Array<{
    amount_paid_pence: number;
  }>;
  const pences = [
    ...bookings.map((b) => b.price_pence ?? 0),
    ...purchases.map((p) => p.amount_paid_pence ?? 0),
  ].filter((n) => n > 0);
  return { pences, count: bookings.length + purchases.length };
}

/**
 * Three KPI windows: current calendar month so far, the full previous
 * calendar month, and the same month a year ago. All bounds are in
 * Europe/London for the period boundaries.
 */
export async function getFinanceKpis(
  tenantId: string,
  vat: TenantVatSettings
): Promise<FinanceKpis> {
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [year, month] = ymd.split("-").map(Number);

  const startThis = monthStartIso(year, month);
  const startNext = monthStartIso(...nextMonth(year, month));
  const startLast = monthStartIso(...prevMonth(year, month));
  const startLastYear = monthStartIso(year - 1, month);
  const startNextLastYear = monthStartIso(...nextMonth(year - 1, month));

  // Determine whether we have data going back ≥ 12 months. Use the
  // earliest tenant booking as a cheap proxy — there's no need to be
  // exact, we're just deciding whether to show "vs same month last
  // year" or a "—" placeholder.
  const supabase = await createServerSupabase();
  const { data: oldestRow } = await supabase
    .from("bookings")
    .select("starts_at")
    .eq("tenant_id", tenantId)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const oldestIso = (oldestRow?.starts_at as string | undefined) ?? null;
  const hasYear =
    !!oldestIso &&
    Date.now() - new Date(oldestIso).getTime() >= 365 * 24 * 60 * 60 * 1000;

  const [thisM, lastM, lastY] = await Promise.all([
    fetchRevenuePencesForRange(tenantId, startThis, startNext),
    fetchRevenuePencesForRange(tenantId, startLast, startThis),
    hasYear
      ? fetchRevenuePencesForRange(tenantId, startLastYear, startNextLastYear)
      : Promise.resolve({ pences: [], count: 0 }),
  ]);

  return {
    thisMonth: {
      ...sumVat(thisM.pences, vat.registered, vat.ratePct),
      count: thisM.count,
    },
    lastMonth: {
      ...sumVat(lastM.pences, vat.registered, vat.ratePct),
      count: lastM.count,
    },
    sameMonthLastYear: hasYear
      ? {
          ...sumVat(lastY.pences, vat.registered, vat.ratePct),
          count: lastY.count,
        }
      : null,
    hasYearOfHistory: hasYear,
  };
}

/**
 * 12 months of revenue points, oldest → newest. The current month is
 * included even though it's partial — the chart renders it as the last
 * point. Each point is already split into ttc + exVat for the line
 * chart.
 */
export async function getMonthlyRevenueSeries(
  tenantId: string,
  vat: TenantVatSettings
): Promise<RevenuePoint[]> {
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [year, month] = ymd.split("-").map(Number);

  const points: RevenuePoint[] = [];
  // Walk backwards 11 months then add current.
  const months: Array<[number, number]> = [];
  let yy = year;
  let mm = month;
  for (let i = 0; i < 12; i++) {
    months.unshift([yy, mm]);
    [yy, mm] = prevMonth(yy, mm);
  }

  // Run all 12 fetches in parallel.
  const ranges = months.map(([y, m]) => {
    const start = monthStartIso(y, m);
    const end = monthStartIso(...nextMonth(y, m));
    return { y, m, start, end };
  });
  const results = await Promise.all(
    ranges.map((r) => fetchRevenuePencesForRange(tenantId, r.start, r.end))
  );

  for (let i = 0; i < ranges.length; i++) {
    const { y, m } = ranges[i];
    const split = sumVat(results[i].pences, vat.registered, vat.ratePct);
    points.push({
      monthIso: `${y}-${String(m).padStart(2, "0")}`,
      label: monthShortLabel(y, m),
      ttcPence: split.ttcPence,
      exVatPence: split.exVatPence,
      vatPence: split.vatPence,
      count: results[i].count,
    });
  }
  return points;
}

// --- helpers ---------------------------------------------------------

function monthStartIso(year: number, month: number): string {
  return fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    TZ
  ).toISOString();
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

function prevMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

function monthShortLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: TZ,
  });
}
