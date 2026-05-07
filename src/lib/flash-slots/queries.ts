import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export interface FlashSlot {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  slotStart: string; // ISO
  slotEnd: string;   // ISO
  flashPricePence: number;
  originalPricePence: number;
  label: string;
  description: string | null;
  maxClaims: number;
  claimsCount: number;
  status: "active" | "fully_claimed" | "expired" | "cancelled";
  expiresAt: string;
}

/**
 * Returns active flash slots for the current session's tenant.
 * Used server-side in portal pages (no admin key needed).
 */
export async function getActiveFlashSlotsForPortal(): Promise<FlashSlot[]> {
  const supabase = await createServerSupabase();

  // Resolve tenant_id from the session cookie (reuse the pattern used elsewhere)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: client } = await supabase
    .from("clients")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!client?.tenant_id) return [];

  const now = new Date().toISOString();
  const { data } = await supabase
    .from("flash_slots")
    .select(`
      id, service_id, staff_id, slot_start, slot_end,
      flash_price_pence, original_price_pence, label, description,
      max_claims, claims_count, status, expires_at,
      services:service_id (name),
      staff:staff_id (display_name)
    `)
    .eq("tenant_id", client.tenant_id)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("slot_start", { ascending: true });

  return ((data ?? []) as unknown as RawRow[]).map(toFlashSlot);
}

/**
 * Returns active flash slots for a tenant — admin side.
 */
export async function getActiveFlashSlotsAdmin(tenantId: string): Promise<FlashSlot[]> {
  const admin = createAdminSupabase();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("flash_slots")
    .select(`
      id, service_id, staff_id, slot_start, slot_end,
      flash_price_pence, original_price_pence, label, description,
      max_claims, claims_count, status, expires_at,
      services:service_id (name),
      staff:staff_id (display_name)
    `)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("slot_start", { ascending: true });

  return ((data ?? []) as unknown as RawRow[]).map(toFlashSlot);
}

/**
 * Validate a flash slot at checkout time.
 * Returns the flash_price_pence if valid, or null if invalid/expired/claimed.
 */
export async function validateFlashSlot(
  flashSlotId: string,
  serviceId: string,
  tenantId: string
): Promise<{ valid: true; flashPricePence: number; staffId: string | null } | { valid: false; reason: string }> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("flash_slots")
    .select("id, service_id, staff_id, flash_price_pence, status, expires_at, max_claims, claims_count")
    .eq("id", flashSlotId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return { valid: false, reason: "Flash deal not found" };
  if (data.service_id !== serviceId) return { valid: false, reason: "Flash deal is for a different service" };
  if (data.status !== "active") return { valid: false, reason: "Flash deal is no longer available" };
  if (new Date(data.expires_at as string) <= new Date()) return { valid: false, reason: "Flash deal has expired" };
  if ((data.claims_count as number) >= (data.max_claims as number)) return { valid: false, reason: "Flash deal is fully claimed" };

  return {
    valid: true,
    flashPricePence: data.flash_price_pence as number,
    staffId: data.staff_id as string | null,
  };
}

/**
 * Increment claims_count after a successful flash booking.
 * Auto-transitions to 'fully_claimed' when maxed out.
 */
export async function claimFlashSlot(flashSlotId: string): Promise<void> {
  const admin = createAdminSupabase();
  // Read current counts
  const { data } = await admin
    .from("flash_slots")
    .select("claims_count, max_claims")
    .eq("id", flashSlotId)
    .maybeSingle();
  if (!data) return;

  const newCount = (data.claims_count as number) + 1;
  const newStatus =
    newCount >= (data.max_claims as number) ? "fully_claimed" : "active";

  await admin
    .from("flash_slots")
    .update({ claims_count: newCount, status: newStatus })
    .eq("id", flashSlotId);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

type RawRow = {
  id: string;
  service_id: string;
  staff_id: string | null;
  slot_start: string;
  slot_end: string;
  flash_price_pence: number;
  original_price_pence: number;
  label: string;
  description: string | null;
  max_claims: number;
  claims_count: number;
  status: "active" | "fully_claimed" | "expired" | "cancelled";
  expires_at: string;
  services: { name: string } | { name: string }[] | null;
  staff: { display_name: string } | { display_name: string }[] | null;
};

function toFlashSlot(r: RawRow): FlashSlot {
  const svc = Array.isArray(r.services) ? r.services[0] : r.services;
  const stf = Array.isArray(r.staff) ? r.staff[0] : r.staff;
  return {
    id: r.id,
    serviceId: r.service_id,
    serviceName: svc?.name ?? "Service",
    staffId: r.staff_id,
    staffName: stf?.display_name ?? null,
    slotStart: r.slot_start,
    slotEnd: r.slot_end,
    flashPricePence: r.flash_price_pence,
    originalPricePence: r.original_price_pence,
    label: r.label,
    description: r.description,
    maxClaims: r.max_claims,
    claimsCount: r.claims_count,
    status: r.status,
    expiresAt: r.expires_at,
  };
}
