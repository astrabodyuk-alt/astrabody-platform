import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface ResourceOption {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/**
 * Active resources for a service, ordered for display. Read via the
 * user-scoped client so portal RLS gates by tenant.
 *
 * Returns an empty array for services that don't define any — the
 * booking flow then renders without the resource step.
 */
export async function getActiveResourcesForService(
  serviceId: string
): Promise<ResourceOption[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("service_resources")
    .select("id, name, description, sort_order")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    sort_order: number;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    sortOrder: r.sort_order,
  }));
}
