import "server-only";
import { unstable_cache } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentClient } from "@/lib/portal/queries";

/**
 * Server-side data loaders for the /portal/book flow.
 * Each function throws "no session" if there is no authenticated portal user.
 */

export interface ServicePickerRow {
  id: string;
  slug: string;
  name: string;
  duration_min: number;
  price_pence: number;
  deposit_pence: number;
  category: string | null;
  sort_order: number;
}

export async function getActiveServicesForCurrentTenant(): Promise<ServicePickerRow[]> {
  // getCurrentClient is React.cache-wrapped — no extra auth/DB call.
  const me = await getCurrentClient();
  return fetchServicesForTenant(me.tenant_id);
}

/**
 * Services list is server-cached per tenant for 5 minutes.
 * It rarely changes; no need to hit the DB on every page visit.
 */
const fetchServicesForTenant = unstable_cache(
  async (tenantId: string): Promise<ServicePickerRow[]> => {
    // Use admin client — unstable_cache runs outside the request context
    // so cookies() / createServerSupabase() would fail. Admin client is safe
    // here because we already verified the user owns this tenantId above.
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("services")
      .select(
        "id, slug, name, duration_min, price_pence, deposit_pence, category, sort_order"
      )
      .eq("tenant_id", tenantId)
      .eq("is_bookable", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ServicePickerRow[];
  },
  ["portal-services"],
  { revalidate: 300, tags: ["services"] }
);

export interface ServiceDetail extends ServicePickerRow {
  description: string | null;
  buffer_min: number;
  min_gap_days: number;
  tenant_id: string;
}

export async function getServiceDetail(
  serviceId: string
): Promise<ServiceDetail | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("services")
    .select(
      "id, slug, name, description, duration_min, buffer_min, price_pence, deposit_pence, category, sort_order, min_gap_days, tenant_id"
    )
    .eq("id", serviceId)
    .eq("is_bookable", true)
    .maybeSingle();
  if (error) throw error;
  return data as ServiceDetail | null;
}

export interface DefaultStaff {
  id: string;
  display_name: string;
  email: string | null;
}

/**
 * V1 default staff for a service: the first staff_services row, ranked by
 * the staff member's sort_order (and active flag).
 *
 * Multi-staff selection on the booking page is V2.
 */
export async function getDefaultStaffForService(
  serviceId: string
): Promise<DefaultStaff | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("staff_services")
    .select("staff:staff_id (id, display_name, email, is_active, sort_order)")
    .eq("service_id", serviceId);
  if (error) throw error;

  type Row = {
    staff:
      | {
          id: string;
          display_name: string;
          email: string | null;
          is_active: boolean;
          sort_order: number;
        }
      | Array<{
          id: string;
          display_name: string;
          email: string | null;
          is_active: boolean;
          sort_order: number;
        }>
      | null;
  };

  const rows = ((data ?? []) as Row[])
    .map((r) => (Array.isArray(r.staff) ? r.staff[0] : r.staff))
    .filter((s): s is NonNullable<typeof s> => !!s && s.is_active);

  rows.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  const top = rows[0];
  if (!top) return null;
  return {
    id: top.id,
    display_name: top.display_name,
    email: top.email,
  };
}

// =====================================================
// Staff list for the practitioner picker step
// =====================================================

export interface PractitionerOption {
  id: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  bioShort: string | null;
  specialties: string[];
  sortOrder: number;
}

/**
 * Active staff who perform `serviceId`, ordered by staff.sort_order.
 * Used by the /portal/book/[serviceId] practitioner step. RLS via
 * staff_portal_read + staff_services_portal_read (added in migration
 * 004) lets the user-scoped client read these rows.
 */
export async function getStaffForService(
  serviceId: string
): Promise<PractitionerOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("staff_services")
    .select(
      "staff:staff_id (id, display_name, email, photo_url, bio_short, specialties, is_active, sort_order)"
    )
    .eq("service_id", serviceId);
  if (error) throw error;

  type Row = {
    staff:
      | {
          id: string;
          display_name: string;
          email: string | null;
          photo_url: string | null;
          bio_short: string | null;
          specialties: string[] | null;
          is_active: boolean;
          sort_order: number;
        }
      | Array<{
          id: string;
          display_name: string;
          email: string | null;
          photo_url: string | null;
          bio_short: string | null;
          specialties: string[] | null;
          is_active: boolean;
          sort_order: number;
        }>
      | null;
  };

  const staffRows = ((data ?? []) as Row[])
    .map((r) => (Array.isArray(r.staff) ? r.staff[0] : r.staff))
    .filter((s): s is NonNullable<typeof s> => !!s && s.is_active);

  staffRows.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  return staffRows.map((s) => ({
    id: s.id,
    displayName: s.display_name,
    email: s.email,
    photoUrl: s.photo_url,
    bioShort: s.bio_short,
    specialties: s.specialties ?? [],
    sortOrder: s.sort_order,
  }));
}

export interface PortalContext {
  clientId: string;
  tenantId: string;
}

/**
 * Resolve the current user → client + tenant ids. Used by the booking-create
 * server action.
 */
export async function getPortalContext(): Promise<PortalContext> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("no session");

  const { data, error } = await supabase
    .from("client_portal_links")
    .select("client_id, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("no portal link");
  return {
    clientId: data.client_id as string,
    tenantId: data.tenant_id as string,
  };
}

// =====================================================
// Free-service redemption support
// =====================================================
//
// When a client redeems a `free_service` reward, redeemReward returns
// the redemptionId. The booking flow uses this lookup to validate the
// redemption + resolve the bound serviceId at every hop:
//   /portal/book?reward=R    → redirects to /portal/book/{serviceId}?reward=R
//   /portal/book/{id}/checkout?reward=R → free-booking flow, no Stripe.

export interface RedemptionForBooking {
  id: string;
  serviceId: string;
  rewardName: string;
  /** True if this redemption hasn't been linked to a booking yet. */
  available: boolean;
}

/**
 * Look up a free-service redemption owned by the current portal client.
 * Returns null if it doesn't exist, isn't a free_service reward, or
 * doesn't belong to this client.
 */
export async function getRedemptionForBooking(
  redemptionId: string
): Promise<RedemptionForBooking | null> {
  const ctx = await getPortalContext().catch(() => null);
  if (!ctx) return null;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("loyalty_redemptions")
    .select(
      "id, client_id, booking_id, status, loyalty_rewards:reward_id (name, kind, service_id)"
    )
    .eq("id", redemptionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.client_id !== ctx.clientId) return null;

  const reward = pickFirstReward((data as { loyalty_rewards: unknown }).loyalty_rewards);
  if (!reward) return null;
  if (reward.kind !== "free_service" || !reward.service_id) return null;

  return {
    id: data.id as string,
    serviceId: reward.service_id,
    rewardName: reward.name,
    available: data.booking_id == null,
  };
}

function pickFirstReward(
  value: unknown
): { name: string; kind: string; service_id: string | null } | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as { name: string; kind: string; service_id: string | null }) ?? null;
  return value as { name: string; kind: string; service_id: string | null };
}
