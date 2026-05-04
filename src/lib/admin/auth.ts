import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Shared auth resolver for /admin/*. Cached per request via React.cache,
 * so the layout + page can both call without duplicate DB hits.
 *
 * `getAdminContext()` returns null on no-access (use this for branching).
 * `getAdminContextOrRedirect()` redirects on no-access (most pages use this).
 */

export interface AdminContext {
  userId: string;
  email: string | null;
  tenantId: string;
  role: "owner" | "admin" | "staff";
  isOwnerOrAdmin: boolean;
  staffId: string | null;
  staffName: string | null;
}

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "staff"])
    .maybeSingle();
  if (!member) return null;

  const role = member.role as "owner" | "admin" | "staff";
  const tenantId = member.tenant_id as string;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, display_name")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId,
    role,
    isOwnerOrAdmin: role === "owner" || role === "admin",
    staffId: (staff?.id as string | undefined) ?? null,
    staffName: (staff?.display_name as string | undefined) ?? null,
  };
});

export async function getAdminContextOrRedirect(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/portal");
  return ctx;
}
