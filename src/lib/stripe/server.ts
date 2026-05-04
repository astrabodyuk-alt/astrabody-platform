import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazy-initialised server-side Stripe SDK.
 * Test-mode key in V1 (Astrabody as the only tenant). Single key model
 * works because Astrabody owns the platform's Stripe account.
 *
 * TODO(multi-tenant): when we onboard external tenants in V2, swap to
 * Stripe Connect destination charges so each tenant's deposits land in
 * their own connected account, not the platform's.
 */
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    appInfo: {
      name: "Astrabody Platform",
      version: "0.1.0",
    },
  });
  return _stripe;
}
