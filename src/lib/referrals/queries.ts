import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8-character upper-case alphanumeric, e.g. "JADE8K2P". */
export function generateReferralCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length];
  return out;
}

/**
 * Ensure the client has a referral_code on file. Generates a fresh one
 * if missing and persists it (with retry on the unique-index collision
 * — astronomically rare but cheap to handle).
 */
export async function ensureClientReferralCode(
  clientId: string
): Promise<string> {
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("clients")
    .select("referral_code")
    .eq("id", clientId)
    .maybeSingle();
  const existing = (row?.referral_code as string | null | undefined) ?? null;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await admin
      .from("clients")
      .update({ referral_code: code })
      .eq("id", clientId)
      .is("referral_code", null);
    if (!error) return code;
    if (!String(error.message).toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
  }
  throw new Error("Couldn't allocate a referral code.");
}

interface RefLookup {
  referrer_client_id: string;
  tenant_id: string;
  referrer_credit_pence: number;
  referred_credit_pence: number;
  enabled: boolean;
  min_booking_pence: number;
}

/**
 * Look up a referral_code in a tenant. Returns the referrer's id +
 * the tenant's referral programme settings (so the booking flow can
 * skip claiming if the programme is off, or if the booking is below
 * the minimum). Returns null when the code doesn't match.
 */
export async function lookupReferrer(
  tenantId: string,
  rawCode: string
): Promise<RefLookup | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return null;

  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from("clients")
    .select("id, tenant_id")
    .eq("tenant_id", tenantId)
    .ilike("referral_code", code)
    .maybeSingle();
  if (!client) return null;

  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "referral_enabled, referral_referrer_pence, referral_referred_pence, referral_min_booking_pence"
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return null;

  return {
    referrer_client_id: client.id as string,
    tenant_id: tenantId,
    referrer_credit_pence:
      (tenant.referral_referrer_pence as number | undefined) ?? 1000,
    referred_credit_pence:
      (tenant.referral_referred_pence as number | undefined) ?? 1000,
    enabled: (tenant.referral_enabled as boolean | undefined) ?? false,
    min_booking_pence:
      (tenant.referral_min_booking_pence as number | undefined) ?? 0,
  };
}

export interface ReferralSummary {
  referralCode: string;
  total: number;
  converted: number;
  rewarded: number;
  earnedPence: number;
}

/**
 * Roll-up shown on /portal/me — total invited, total converted, total
 * rewarded, and £ earned (sum of referrer_credit_pence on rewarded rows).
 */
export async function getReferralSummary(
  clientId: string,
  tenantId: string
): Promise<ReferralSummary> {
  const code = await ensureClientReferralCode(clientId);
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("referrals")
    .select("status, referrer_credit_pence")
    .eq("tenant_id", tenantId)
    .eq("referrer_client_id", clientId);
  const rows = (data ?? []) as Array<{
    status: string;
    referrer_credit_pence: number;
  }>;
  let converted = 0;
  let rewarded = 0;
  let earnedPence = 0;
  for (const r of rows) {
    if (r.status === "converted") converted++;
    if (r.status === "rewarded") {
      rewarded++;
      earnedPence += r.referrer_credit_pence;
    }
  }
  return {
    referralCode: code,
    total: rows.length,
    converted,
    rewarded,
    earnedPence,
  };
}
