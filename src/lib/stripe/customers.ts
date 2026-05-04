import "server-only";
import { stripe } from "./server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Get or create the Stripe Customer for a given platform client.
 * Idempotent — caches the customer id back onto clients.stripe_customer_id
 * so we never create duplicates. Used by:
 *   - the checkout flow when the user ticks "save my card"
 *   - the /portal/account "add a card" flow
 *   - any future off-session charge (no-show, late cancel, pack purchase)
 */
export async function getOrCreateStripeCustomerId(input: {
  clientId: string;
  tenantId: string;
}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from("clients")
    .select("id, tenant_id, stripe_customer_id, full_name, email, phone")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client || client.tenant_id !== input.tenantId) {
    return { ok: false, error: "client not in this tenant" };
  }

  const existing = client.stripe_customer_id as string | null;
  if (existing) return { ok: true, customerId: existing };

  try {
    const customer = await stripe().customers.create({
      name: (client.full_name as string | null) ?? undefined,
      email: (client.email as string | null) ?? undefined,
      phone: (client.phone as string | null) ?? undefined,
      metadata: {
        astrabody_client_id: client.id as string,
        astrabody_tenant_id: input.tenantId,
      },
    });
    await admin
      .from("clients")
      .update({ stripe_customer_id: customer.id })
      .eq("id", client.id);
    return { ok: true, customerId: customer.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe customer create failed";
    return { ok: false, error: msg };
  }
}
