import "server-only";
import type Stripe from "stripe";
import { stripe } from "./server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * After a checkout PaymentIntent succeeds with `setup_future_usage`
 * set, the PM is automatically attached to the customer. This helper:
 *   1. Reads the PM from Stripe.
 *   2. Upserts a client_payment_methods row for it.
 *   3. Flips that row to default; flips all other PMs for this client
 *      to is_default=false.
 *   4. Denormalises brand / last4 / exp onto the clients row so we
 *      can show "•• 4242" without an extra Stripe round-trip.
 *
 * Called from /api/bookings/[id]/confirm when metadata.save_card === 'yes'.
 *
 * Idempotent — re-running for the same PI is a no-op.
 */
export async function saveCardFromPaymentIntent(input: {
  paymentIntentId: string;
  clientId: string;
  tenantId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe().paymentIntents.retrieve(input.paymentIntentId, {
      expand: ["payment_method"],
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "could not retrieve PI",
    };
  }

  if (pi.metadata?.save_card !== "yes") {
    // Caller checks this too, but defence in depth.
    return { ok: true };
  }

  const pm = pi.payment_method;
  if (!pm || typeof pm === "string") {
    return { ok: false, error: "no payment method on intent" };
  }
  if (pm.type !== "card" || !pm.card) {
    // Only cards in V1. Apple/Google Pay flow through PMs of type 'card'
    // anyway via the wallet network token, so this should cover them.
    return { ok: true };
  }

  const customerId =
    typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;

  return persistCardForClient({
    tenantId: input.tenantId,
    clientId: input.clientId,
    paymentMethod: pm,
    stripeCustomerId: customerId,
  });
}

/**
 * Used by both the checkout save-card path and the /portal/account
 * add-card flow (which uses a SetupIntent rather than a PaymentIntent).
 */
export async function persistCardForClient(input: {
  tenantId: string;
  clientId: string;
  paymentMethod: Stripe.PaymentMethod;
  stripeCustomerId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const pm = input.paymentMethod;
  if (pm.type !== "card" || !pm.card) {
    return { ok: false, error: "non-card payment methods are not supported" };
  }

  const admin = createAdminSupabase();

  // Upsert the row in client_payment_methods.
  const { error: upsertError } = await admin
    .from("client_payment_methods")
    .upsert(
      {
        tenant_id: input.tenantId,
        client_id: input.clientId,
        stripe_payment_method_id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        is_default: true,
      },
      { onConflict: "client_id,stripe_payment_method_id" }
    );
  if (upsertError) return { ok: false, error: upsertError.message };

  // Flip every other PM for this client to is_default = false.
  await admin
    .from("client_payment_methods")
    .update({ is_default: false })
    .eq("client_id", input.clientId)
    .neq("stripe_payment_method_id", pm.id);

  // Mirror onto clients (so the booking flow can detect "card on file"
  // without joining client_payment_methods).
  const update: Record<string, unknown> = {
    default_payment_method_id: pm.id,
    card_brand: pm.card.brand,
    card_last4: pm.card.last4,
    card_exp_month: pm.card.exp_month,
    card_exp_year: pm.card.exp_year,
    saved_card_at: new Date().toISOString(),
  };
  if (input.stripeCustomerId) {
    update.stripe_customer_id = input.stripeCustomerId;
  }
  const { error: clientError } = await admin
    .from("clients")
    .update(update)
    .eq("id", input.clientId);
  if (clientError) return { ok: false, error: clientError.message };

  return { ok: true };
}
