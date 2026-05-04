import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface WalletVoucher {
  id: string;
  kind: "percent" | "amount" | "free_service";
  valuePct: number | null;
  valuePence: number | null;
  serviceId: string | null;
  /** Joined via FK; null when serviceId is null. */
  serviceName: string | null;
  source: string;
  expiresAt: string;
}

export interface Wallet {
  currentPoints: number;
  vouchers: WalletVoucher[];
}

/**
 * Server-side wallet snapshot for one client.
 * Filters out expired or already-redeemed vouchers — only the live
 * spendable balance comes back. Used by:
 *   - /portal home WalletCard
 *   - /portal/book/[serviceId]/checkout price combiner
 */
export async function getWalletForClient(clientId: string): Promise<Wallet> {
  const supabase = await createServerSupabase();
  const [accountResult, vouchersResult] = await Promise.all([
    supabase
      .from("loyalty_accounts")
      .select("current_points")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("loyalty_vouchers")
      .select(
        "id, kind, value_pct, value_pence, service_id, source, expires_at, services (name)"
      )
      .eq("client_id", clientId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true }),
  ]);

  const currentPoints =
    (accountResult.data?.current_points as number | undefined) ?? 0;

  type RawVoucher = {
    id: string;
    kind: "percent" | "amount" | "free_service";
    value_pct: number | null;
    value_pence: number | null;
    service_id: string | null;
    source: string;
    expires_at: string;
    services: unknown;
  };
  const vouchers = ((vouchersResult.data ?? []) as unknown as RawVoucher[]).map(
    (v): WalletVoucher => {
      const svc = pickFirst<{ name: string | null }>(v.services);
      return {
        id: v.id,
        kind: v.kind,
        valuePct: v.value_pct,
        valuePence: v.value_pence,
        serviceId: v.service_id,
        serviceName: svc?.name ?? null,
        source: v.source,
        expiresAt: v.expires_at,
      };
    }
  );

  return { currentPoints, vouchers };
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
