import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Number of pending comms proposals for a tenant. Used by the admin
 * layout to badge the Emails nav item — "you've got announcements
 * waiting to send".
 */
export async function getPendingProposalsCount(
  tenantId: string
): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("comms_proposals")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  return count ?? 0;
}
