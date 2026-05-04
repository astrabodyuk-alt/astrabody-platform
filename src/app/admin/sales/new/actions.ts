"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";

/**
 * Search clients by name / email / phone within the current tenant.
 * Used by the New-sale wizard's client-picker (step 1). Limited to 20
 * results — the wizard's UX assumes the operator types enough to narrow
 * it. Returns shape mirrors what the picker needs to render rows.
 */
export async function searchClientsForSale(
  query: string
): Promise<
  | {
      ok: true;
      results: Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const q = query.trim();
  if (q.length < 2) return { ok: true, results: [] };

  const admin = createAdminSupabase();
  // ilike pattern with % on each side. PostgREST `or` joins three columns.
  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const { data } = await admin
    .from("clients")
    .select("id, full_name, email, phone")
    .eq("tenant_id", ctx.tenantId)
    .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    ok: true,
    results: ((data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    }>),
  };
}
