import "server-only";
import type Stripe from "stripe";
import { stripe } from "./server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface ChargeSavedCardInput {
  tenantId: string;
  clientId: string;
  amountPence: number;
  description: string;
  /** Free-form metadata for Stripe. We always merge in client + tenant ids. */
  metadata?: Record<string, string>;
  /**
   * If false (the default for staff-side no-show flow), `off_session: true`
   * is sent to Stripe — the client isn't on the device. Stripe will
   * decline rather than challenge for SCA in this mode; we surface the
   * decline to the staff UI rather than retrying.
   *
   * If true (Apple/Google Pay-style on-session), the client IS at the
   * keyboard and we can handle SCA inline. Used by the future one-tap
   * pack purchase from /portal.
   */
  onSession?: boolean;
}

export type ChargeResult =
  | {
      ok: true;
      paymentIntentId: string;
      amountPence: number;
      brand: string | null;
      last4: string | null;
    }
  | {
      ok: false;
      error: string;
      /** When non-null, the charge needs SCA — surface to the user. */
      requiresActionClientSecret?: string;
    };

/**
 * Off-session (or optionally on-session) charge against the client's
 * default saved card. Used by:
 *   - markBookingNoShow + chargeLateCancellation (off-session)
 *   - one-tap pack / product purchases (on-session) — TODO(prompt 11)
 *
 * Reads the client's stripe_customer_id + default_payment_method_id
 * from the clients table. If either is missing, returns ok:false with
 * "no card on file".
 */
export async function chargeSavedCard(
  input: ChargeSavedCardInput
): Promise<ChargeResult> {
  const admin = createAdminSupabase();

  const { data: client } = await admin
    .from("clients")
    .select(
      "id, tenant_id, stripe_customer_id, default_payment_method_id, card_brand, card_last4"
    )
    .eq("id", input.clientId)
    .maybeSingle();

  if (!client || client.tenant_id !== input.tenantId) {
    return { ok: false, error: "client not in this tenant" };
  }
  const customerId = client.stripe_customer_id as string | null;
  const pmId = client.default_payment_method_id as string | null;
  if (!customerId || !pmId) {
    return { ok: false, error: "no card on file" };
  }
  if (!Number.isFinite(input.amountPence) || input.amountPence < 30) {
    // Stripe minimum charge in GBP is 30p. Anything below would be
    // rejected anyway.
    return { ok: false, error: "amount below £0.30 minimum" };
  }

  const params: Stripe.PaymentIntentCreateParams = {
    amount: Math.round(input.amountPence),
    currency: "gbp",
    customer: customerId,
    payment_method: pmId,
    confirm: true,
    description: input.description,
    metadata: {
      ...(input.metadata ?? {}),
      astrabody_client_id: input.clientId,
      astrabody_tenant_id: input.tenantId,
    },
  };
  if (!input.onSession) {
    params.off_session = true;
  } else {
    // For on-session pack purchases we use automatic_payment_methods so
    // wallets / link still work if the saved PM is rejected.
    params.automatic_payment_methods = { enabled: true, allow_redirects: "never" };
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe().paymentIntents.create(params);
  } catch (e) {
    // Stripe surfaces card errors as exceptions when confirm:true. Pull
    // out the message + (when present) the next-action client secret.
    if (
      typeof e === "object" &&
      e !== null &&
      "raw" in e &&
      typeof (e as { raw?: unknown }).raw === "object"
    ) {
      const raw = (e as { raw: { message?: string; payment_intent?: { client_secret?: string } } }).raw;
      return {
        ok: false,
        error: raw.message ?? "card declined",
        requiresActionClientSecret: raw.payment_intent?.client_secret,
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "charge failed",
    };
  }

  if (pi.status === "succeeded") {
    return {
      ok: true,
      paymentIntentId: pi.id,
      amountPence: pi.amount,
      brand: (client.card_brand as string | null) ?? null,
      last4: (client.card_last4 as string | null) ?? null,
    };
  }

  if (pi.status === "requires_action") {
    return {
      ok: false,
      error: "issuer wants to verify this charge — try again on-session",
      requiresActionClientSecret: pi.client_secret ?? undefined,
    };
  }

  return { ok: false, error: `unexpected payment status: ${pi.status}` };
}
