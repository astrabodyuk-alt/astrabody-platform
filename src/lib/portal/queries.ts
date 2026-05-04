import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { createServerSupabase } from "@/lib/supabase/server";
import type { LoyaltyTier } from "@/lib/utils";

/**
 * Server-side data loaders for the client portal.
 * Each function:
 *   - Builds its own server Supabase client (auth state is read from cookies).
 *   - Throws "no session" if there is no authenticated user.
 *   - Relies on RLS policies from migrations 002 / 003 (client-self read).
 *
 * The shapes returned here match the props of the existing portal
 * components, so the page renders unchanged.
 */

// ============================================================
// 1. getCurrentClient
// ============================================================

export interface CurrentClient {
  id: string;
  firstName: string;
  initials: string;
  tenant_id: string;
}

export async function getCurrentClient(): Promise<CurrentClient> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("no session");

  const { data, error } = await supabase
    .from("client_portal_links")
    .select("client_id, tenant_id, clients(full_name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("no client portal link for current user");

  const client = pickFirst<{ full_name: string | null }>(data.clients);
  const fullName = client?.full_name ?? "";

  return {
    id: data.client_id as string,
    tenant_id: data.tenant_id as string,
    firstName: deriveFirstName(fullName, user.email ?? ""),
    initials: deriveInitials(fullName, user.email ?? ""),
  };
}

// ============================================================
// 2. getLoyaltyAccount
// ============================================================

export interface LoyaltyView {
  tier: LoyaltyTier;
  currentPoints: number;
  lifetimePoints: number;
  memberSince: string;
  nextReward?: { name: string; costPoints: number };
}

export async function getLoyaltyAccount(
  clientId: string
): Promise<LoyaltyView> {
  const supabase = await createServerSupabase();
  await assertSession(supabase);

  const { data: account, error } = await supabase
    .from("loyalty_accounts")
    .select("tier, current_points, lifetime_points, created_at, tenant_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw error;

  const tier = (account?.tier ?? "friend") as LoyaltyTier;
  const currentPoints = (account?.current_points as number | undefined) ?? 0;
  const lifetimePoints = (account?.lifetime_points as number | undefined) ?? 0;
  const createdAt = (account?.created_at as string | undefined) ?? new Date().toISOString();
  const memberSince = formatMonthYear(createdAt);

  // A brand-new client may not have a loyalty_accounts row yet (the trigger
  // only fires after the first ledger entry). In that case fall back to the
  // portal link to pick up the tenant_id.
  let tenantId = account?.tenant_id as string | undefined;
  if (!tenantId) {
    const { data: link } = await supabase
      .from("client_portal_links")
      .select("tenant_id")
      .eq("client_id", clientId)
      .maybeSingle();
    tenantId = link?.tenant_id as string | undefined;
  }

  let nextReward: LoyaltyView["nextReward"];
  if (tenantId) {
    const { data: reward, error: rewardError } = await supabase
      .from("loyalty_rewards")
      .select("name, cost_points")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gt("cost_points", currentPoints)
      .order("cost_points", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (rewardError) throw rewardError;
    if (reward) {
      nextReward = {
        name: reward.name as string,
        costPoints: reward.cost_points as number,
      };
    }
  }

  return { tier, currentPoints, lifetimePoints, memberSince, nextReward };
}

// ============================================================
// 3. getNextBooking
// ============================================================

export interface NextBookingView {
  bookingId: string;
  startsAt: string;
  service: string;
  staffName: string;
  durationMin: number;
  resourceName: string | null;
  /** True when the client can self-reschedule right now (status confirmed + outside cutoff). */
  canReschedule: boolean;
}

export async function getNextBooking(
  clientId: string
): Promise<NextBookingView | null> {
  const supabase = await createServerSupabase();
  await assertSession(supabase);

  const { data: dataRaw, error } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, tenant_id, " +
        "services (name, duration_min), " +
        "staff!bookings_staff_id_fkey (display_name), " +
        "service_resources:resource_id (name)"
    )
    .eq("client_id", clientId)
    .gte("starts_at", new Date().toISOString())
    .in("status", ["pending", "confirmed"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const data = dataRaw as unknown as
    | {
        id: string;
        starts_at: string;
        ends_at: string;
        status: string;
        tenant_id: string;
        services: unknown;
        staff: unknown;
        service_resources: unknown;
      }
    | null;
  if (!data) return null;

  const service = pickFirst<{ name: string | null; duration_min: number | null }>(
    data.services
  );
  const staff = pickFirst<{ display_name: string | null }>(data.staff);
  const resource = pickFirst<{ name: string | null }>(data.service_resources);

  const startsAt = data.starts_at;
  const endsAt = data.ends_at;
  const computedDuration = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000
  );

  // Tenant cutoff drives whether the chevron menu shows Reschedule.
  let cutoffHours = 1;
  if (data.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("reschedule_cutoff_hours")
      .eq("id", data.tenant_id)
      .maybeSingle();
    cutoffHours =
      (tenant?.reschedule_cutoff_hours as number | undefined) ?? 1;
  }
  const canReschedule =
    data.status === "confirmed" &&
    new Date(startsAt).getTime() - Date.now() >= cutoffHours * 3_600_000;

  return {
    bookingId: data.id,
    startsAt,
    service: service?.name ?? "Session",
    staffName: staff?.display_name ?? "Astrabody",
    durationMin: service?.duration_min ?? computedDuration,
    resourceName: resource?.name ?? null,
    canReschedule,
  };
}

// ============================================================
// 4. getProgressSeries
// ============================================================

export interface ProgressView {
  series: number[];
  deltaCm: number;
  weeksTracked: number;
  sessionsCompleted: number;
  startedMonth: string;
}

export async function getProgressSeries(
  clientId: string
): Promise<ProgressView | null> {
  const supabase = await createServerSupabase();
  await assertSession(supabase);

  const { data, error } = await supabase
    .from("session_logs")
    .select("created_at, metrics")
    .eq("client_id", clientId)
    .eq("is_shared_with_client", true)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;

  const rows = (data ?? [])
    .map((r) => {
      const waist = parseWaist(r.metrics);
      return waist === null
        ? null
        : { when: r.created_at as string, waist };
    })
    .filter((r): r is { when: string; waist: number } => r !== null)
    .reverse(); // chronological asc, oldest first

  // Total completed sessions is a separate count, not tied to logs.
  const { count: completedCount, error: countError } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "completed");
  if (countError) throw countError;

  if (rows.length < 2) return null;

  const series = rows.map((r) => r.waist);
  const deltaCm = series[series.length - 1] - series[0];
  const startWhen = new Date(rows[0].when);
  const endWhen = new Date(rows[rows.length - 1].when);
  const weeksTracked = Math.max(
    1,
    Math.round(
      (endWhen.getTime() - startWhen.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    )
  );
  const startedMonth = startWhen.toLocaleString("en-GB", { month: "long" });

  return {
    series,
    deltaCm,
    weeksTracked,
    sessionsCompleted: completedCount ?? 0,
    startedMonth,
  };
}

// ============================================================
// 5. getTodayFlashSlots
// ============================================================

export interface FlashSlotView {
  id: string;
  startsAt: string;
  service: string;
  staffName: string;
  durationMin: number;
  listPricePence: number;
  flashPricePence: number;
}

export async function getTodayFlashSlots(
  tenantId: string
): Promise<FlashSlotView[]> {
  const supabase = await createServerSupabase();
  await assertSession(supabase);

  // V1 hard-codes Europe/London (Astrabody's tz). When we onboard tenants
  // outside the UK, swap this for a lookup against tenants.timezone.
  const tz = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const start = fromZonedTime(`${ymd}T00:00:00`, tz);
  const end = fromZonedTime(`${ymd}T23:59:59.999`, tz);

  const { data, error } = await supabase
    .from("flash_slots")
    .select(
      "id, starts_at, ends_at, list_price_pence, flash_price_pence, services (name, duration_min), staff (display_name)"
    )
    .eq("tenant_id", tenantId)
    .is("claimed_at", null)
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const service = pickFirst<{ name: string | null; duration_min: number | null }>(
      (row as { services: unknown }).services
    );
    const staff = pickFirst<{ display_name: string | null }>(
      (row as { staff: unknown }).staff
    );
    const startsAt = row.starts_at as string;
    const endsAt = row.ends_at as string;
    const computedDuration = Math.round(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000
    );
    return {
      id: row.id as string,
      startsAt,
      service: service?.name ?? "Session",
      staffName: staff?.display_name ?? "Astrabody",
      durationMin: service?.duration_min ?? computedDuration,
      listPricePence: row.list_price_pence as number,
      flashPricePence: row.flash_price_pence as number,
    };
  });
}

// ============================================================
// helpers
// ============================================================

async function assertSession(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>
): Promise<void> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("no session");
}

function deriveFirstName(fullName: string, emailFallback: string): string {
  const trimmed = fullName.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const localPart = emailFallback.split("@")[0]?.trim();
  return localPart || "there";
}

function deriveInitials(fullName: string, emailFallback: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const local = emailFallback.split("@")[0] ?? "";
  if (local) return local.slice(0, 2).toUpperCase();
  return "✨";
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function parseWaist(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== "object") return null;
  const v = (metrics as Record<string, unknown>).waist_cm;
  const n =
    typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// PostgREST returns embedded rows either as a single object (one-to-one)
// or as an array (one-to-many) depending on the schema cache. Coerce.
function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
