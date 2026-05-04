import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { describeSegment, type SegmentQuery } from "./segments-shared";

// Re-export so existing server-side imports of these from
// "@/lib/email/segments" keep working. Client components must import
// from "@/lib/email/segments-shared" directly.
export { describeSegment };
export type { SegmentQuery };

/**
 * Broadcast segments. The composer picks one of these by id, parameters
 * fill the optional bits. The resolver returns either a count (for the
 * live "this will go to N people" tag) or a full recipient list (for
 * the actual send).
 *
 * Constraint: `marketing_opt_in = true` is enforced everywhere except
 * the "all consenting clients" segment, which is the same thing said
 * out loud. Without consent we don't broadcast — full stop.
 */

export interface SegmentRecipient {
  clientId: string;
  email: string;
  fullName: string | null;
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Resolve a SegmentQuery to the matching client rows for a tenant.
 * `count` is just the array length — kept as a separate helper so the
 * composer can tag a segment without paying for the full recipient
 * list each keystroke.
 */
export async function resolveSegmentRecipients(
  tenantId: string,
  query: SegmentQuery
): Promise<SegmentRecipient[]> {
  const admin = createAdminSupabase();

  if (query.type === "all") {
    const { data } = await admin
      .from("clients")
      .select("id, email, full_name")
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null);
    return shape(data);
  }

  if (query.type === "inactive_60d") {
    const cutoff = new Date(Date.now() - SIXTY_DAYS_MS).toISOString();
    const { data } = await admin
      .from("clients")
      .select("id, email, full_name, last_booking_at")
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null);
    const rows = (data ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      last_booking_at: string | null;
    }>;
    return rows
      .filter(
        (r) => !r.last_booking_at || r.last_booking_at < cutoff
      )
      .map((r) => ({
        clientId: r.id,
        email: r.email ?? "",
        fullName: r.full_name,
      }))
      .filter((r) => r.email);
  }

  if (query.type === "tier") {
    const min = query.params?.min ?? "insider";
    const tiers =
      min === "inner_circle" ? ["inner_circle"] : ["insider", "inner_circle"];
    const { data } = await admin
      .from("clients")
      .select(
        "id, email, full_name, loyalty_accounts!inner(tier)"
      )
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null)
      .in("loyalty_accounts.tier", tiers);
    return shape(data);
  }

  if (query.type === "service") {
    const serviceId = query.params?.serviceId;
    if (!serviceId) return [];
    const { data: bookingClients } = await admin
      .from("bookings")
      .select("client_id")
      .eq("tenant_id", tenantId)
      .eq("service_id", serviceId)
      .in("status", ["confirmed", "completed"]);
    const ids = Array.from(
      new Set(
        ((bookingClients ?? []) as Array<{ client_id: string }>)
          .map((b) => b.client_id)
          .filter(Boolean)
      )
    );
    if (ids.length === 0) return [];
    const { data: clients } = await admin
      .from("clients")
      .select("id, email, full_name")
      .in("id", ids)
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null);
    return shape(clients);
  }

  return [];
}

export async function countSegment(
  tenantId: string,
  query: SegmentQuery
): Promise<number> {
  const recipients = await resolveSegmentRecipients(tenantId, query);
  return recipients.length;
}

function shape(data: unknown): SegmentRecipient[] {
  return ((data ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
  }>)
    .filter((r) => !!r.email)
    .map((r) => ({
      clientId: r.id,
      email: r.email as string,
      fullName: r.full_name,
    }));
}

