import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface ActivePack {
  id: string;
  name: string;
  serviceId: string;
  serviceName: string | null;
  sessionsTotal: number;
  sessionsRemaining: number;
  expiresAt: string;
  /** ISO date when the pack was sold. Used for "Sold by X on date" line. */
  soldAt: string | null;
}

/**
 * Active client_packages for one client, oldest-expiring first. We
 * filter to status='active' and expires_at > now() so the result is
 * what's spendable right now. Used by:
 *   - /portal home "Your packs" card
 *   - /portal/book step 3 pack-aware notice
 *   - the booking action's pack-consumption short-circuit (defence in
 *     depth — the action also re-validates).
 */
export async function getActivePacksForClient(
  clientId: string
): Promise<ActivePack[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("client_packages")
    .select(
      "id, sessions_total, sessions_remaining, expires_at, service_id, " +
        "service_packages:package_id (name), " +
        "services:service_id (name), " +
        "package_purchases (created_at)"
    )
    .eq("client_id", clientId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });

  type Raw = {
    id: string;
    sessions_total: number;
    sessions_remaining: number;
    expires_at: string;
    service_id: string;
    service_packages: { name: string } | { name: string }[] | null;
    services: { name: string | null } | { name: string | null }[] | null;
    package_purchases: Array<{ created_at: string }> | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const pkg = pickFirst<{ name: string }>(r.service_packages);
    const svc = pickFirst<{ name: string | null }>(r.services);
    const soldAt = (r.package_purchases ?? [])[0]?.created_at ?? null;
    return {
      id: r.id,
      name: pkg?.name ?? "Pack",
      serviceId: r.service_id,
      serviceName: svc?.name ?? null,
      sessionsTotal: r.sessions_total,
      sessionsRemaining: r.sessions_remaining,
      expiresAt: r.expires_at,
      soldAt,
    };
  });
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
