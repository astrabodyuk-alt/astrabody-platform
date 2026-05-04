import "server-only";
import { stripe } from "./server";
import { getOrCreateStripeCustomerId } from "./customers";

/**
 * Create a SetupIntent the client can confirm in /portal/account to
 * add or replace a card *without* paying. Returns the client_secret
 * the browser needs to bind a Stripe Elements PaymentElement to.
 *
 * usage='off_session' so the saved PM can be charged later for
 * no-shows / late-cancels / pack purchases without the client present.
 */
export async function createSetupIntentForClient(input: {
  clientId: string;
  tenantId: string;
}): Promise<
  | { ok: true; clientSecret: string; customerId: string }
  | { ok: false; error: string }
> {
  const customerResult = await getOrCreateStripeCustomerId(input);
  if (!customerResult.ok) {
    return { ok: false, error: customerResult.error };
  }
  try {
    const intent = await stripe().setupIntents.create({
      customer: customerResult.customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        astrabody_client_id: input.clientId,
        astrabody_tenant_id: input.tenantId,
      },
    });
    if (!intent.client_secret) {
      return { ok: false, error: "no client_secret on setup intent" };
    }
    return {
      ok: true,
      clientSecret: intent.client_secret,
      customerId: customerResult.customerId,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "setup intent create failed",
    };
  }
}
