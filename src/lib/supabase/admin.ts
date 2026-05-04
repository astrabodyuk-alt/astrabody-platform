import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use with care.
 * Server-only by import. Never reach into a "use client" component.
 *
 * Use cases:
 *   - Post-auth bootstrap: insert clients + client_portal_links rows for
 *     a brand-new portal user (the user has no tenant membership yet,
 *     so they cannot satisfy the RLS check on those tables).
 *   - Webhook handlers (Stripe, WhatsApp) that must write rows from
 *     anonymous request contexts.
 *   - Admin / cron jobs that operate across tenants.
 *
 * Document why each call needs admin in the call site.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
