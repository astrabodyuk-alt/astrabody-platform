import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface CancellationPolicy {
  enabled: boolean;
  /** 0–100 (percent of price_pence to charge for a no-show). */
  noshowChargePct: number;
  /** 0–100 (percent of price_pence for late cancellations). */
  lateCancelChargePct: number;
  /** Window before starts_at in which a cancellation counts as "late". */
  lateCancelCutoffHours: number;
  /** Owner-written override. When set, replaces the auto text on display. */
  customText: string | null;
}

const DEFAULT: CancellationPolicy = {
  enabled: true,
  noshowChargePct: 100,
  lateCancelChargePct: 50,
  lateCancelCutoffHours: 24,
  customText: null,
};

/**
 * Read the tenant's cancellation policy. Server-supabase variant for
 * server components / actions running in the user's RLS context.
 */
export async function getCancellationPolicy(
  tenantId: string
): Promise<CancellationPolicy> {
  const supabase = await createServerSupabase();
  return readPolicyRow(
    supabase
      .from("tenants")
      .select(
        "cancellation_policy_enabled, noshow_charge_pct, late_cancel_charge_pct, late_cancel_cutoff_hours, cancellation_policy_text"
      )
      .eq("id", tenantId)
      .maybeSingle()
  );
}

/**
 * Same, via the service-role client. Used by server actions that
 * already hold an admin client (charge flows, dispatchers).
 */
export async function getCancellationPolicyAdmin(
  tenantId: string
): Promise<CancellationPolicy> {
  const admin = createAdminSupabase();
  return readPolicyRow(
    admin
      .from("tenants")
      .select(
        "cancellation_policy_enabled, noshow_charge_pct, late_cancel_charge_pct, late_cancel_cutoff_hours, cancellation_policy_text"
      )
      .eq("id", tenantId)
      .maybeSingle()
  );
}

type PolicyQuery = PromiseLike<{
  data: {
    cancellation_policy_enabled: boolean | null;
    noshow_charge_pct: number | null;
    late_cancel_charge_pct: number | null;
    late_cancel_cutoff_hours: number | null;
    cancellation_policy_text: string | null;
  } | null;
}>;

async function readPolicyRow(query: PolicyQuery): Promise<CancellationPolicy> {
  const { data } = await query;
  if (!data) return DEFAULT;
  return {
    enabled: data.cancellation_policy_enabled ?? DEFAULT.enabled,
    noshowChargePct:
      data.noshow_charge_pct ?? DEFAULT.noshowChargePct,
    lateCancelChargePct:
      data.late_cancel_charge_pct ?? DEFAULT.lateCancelChargePct,
    lateCancelCutoffHours:
      data.late_cancel_cutoff_hours ?? DEFAULT.lateCancelCutoffHours,
    customText: data.cancellation_policy_text ?? null,
  };
}

/** Auto-generated three-line summary used on the checkout policy box. */
export function describePolicy(policy: CancellationPolicy): string[] {
  if (!policy.enabled) return ["No cancellation fees apply."];
  if (policy.customText) {
    return policy.customText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  return [
    `No-show: ${policy.noshowChargePct}% of session price.`,
    `Cancel within ${policy.lateCancelCutoffHours}h: ${policy.lateCancelChargePct}%.`,
    `Cancel earlier: free, anytime.`,
  ];
}

/** True when `now` is inside the late-cancel window before `startsAt`. */
export function isLateCancellation(
  startsAt: Date,
  policy: CancellationPolicy,
  now: Date = new Date()
): boolean {
  if (!policy.enabled) return false;
  const cutoffMs = policy.lateCancelCutoffHours * 3_600_000;
  return startsAt.getTime() - now.getTime() < cutoffMs;
}

/** Pence amount to charge for a late cancellation on a booking. */
export function lateCancelChargePence(
  pricePence: number,
  policy: CancellationPolicy
): number {
  if (!policy.enabled) return 0;
  return Math.round((pricePence * policy.lateCancelChargePct) / 100);
}

/** Pence amount to charge for a no-show. */
export function noshowChargePence(
  pricePence: number,
  policy: CancellationPolicy
): number {
  if (!policy.enabled) return 0;
  return Math.round((pricePence * policy.noshowChargePct) / 100);
}
