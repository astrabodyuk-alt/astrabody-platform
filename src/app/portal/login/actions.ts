"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Portal bootstrap, called from the client right after a successful
 * supabase.auth.verifyOtp(). Idempotent — safe on every sign-in.
 *
 * Why an admin client: the user has no tenant_members row, so RLS blocks
 * insert into public.clients (clients_tenant_isolation policy). And they
 * have no client_portal_links row yet, so they cannot satisfy the
 * clients_self policy either. The first sign-in is exactly when neither
 * check passes; the bootstrap has to bypass RLS via service-role.
 *
 * Returns silently on any failure so login isn't blocked. The next
 * server-rendered visit to /portal will surface a clearer error if the
 * link wasn't created.
 */
export async function bootstrapPortalLink(): Promise<void> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return;

  const tenantSlug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? "astrabody";
  const admin = createAdminSupabase();

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError || !tenant) {
    console.error(
      "[login/bootstrap] tenant not found for slug",
      tenantSlug,
      tenantError
    );
    return;
  }

  // Find or create the clients row.
  let clientId: string;
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("email", user.email)
    .maybeSingle();

  if (existing) {
    clientId = existing.id as string;
  } else {
    const fullNameFromMeta =
      typeof user.user_metadata?.full_name === "string"
        ? (user.user_metadata.full_name as string)
        : null;
    const fullName = fullNameFromMeta ?? user.email.split("@")[0];

    const { data: created, error: createError } = await admin
      .from("clients")
      .insert({
        tenant_id: tenant.id,
        full_name: fullName,
        email: user.email,
        marketing_opt_in: false,
        source: "portal_signup",
      })
      .select("id")
      .single();
    if (createError || !created) {
      console.error("[login/bootstrap] failed to create client row", createError);
      return;
    }
    clientId = created.id as string;
  }

  const { error: linkError } = await admin
    .from("client_portal_links")
    .upsert(
      {
        tenant_id: tenant.id,
        client_id: clientId,
        user_id: user.id,
      },
      { onConflict: "user_id,tenant_id" }
    );
  if (linkError) {
    console.error("[login/bootstrap] failed to upsert portal link", linkError);
  }
}
