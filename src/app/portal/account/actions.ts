"use server";

import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { createSetupIntentForClient } from "@/lib/stripe/setup-intent";
import { persistCardForClient } from "@/lib/stripe/save-card";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Resolve the current portal client for the logged-in user. Used by
 * every action below to enforce "you can only touch your own data".
 */
async function getPortalSelf(): Promise<{
  clientId: string;
  tenantId: string;
} | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("client_portal_links")
    .select("client_id, clients (tenant_id)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  type Embed = { tenant_id: string } | { tenant_id: string }[] | null;
  const tenantRow = data.clients as Embed;
  const tenantId = Array.isArray(tenantRow)
    ? tenantRow[0]?.tenant_id
    : tenantRow?.tenant_id;
  if (!tenantId) return null;
  return { clientId: data.client_id as string, tenantId };
}

/**
 * Create a SetupIntent for the current client. Returns the
 * client_secret the modal needs to mount Stripe Elements.
 */
export async function createPortalSetupIntent(): Promise<
  Result<{ clientSecret: string }>
> {
  const me = await getPortalSelf();
  if (!me) return { ok: false, error: "no session" };
  const r = await createSetupIntentForClient(me);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, clientSecret: r.clientSecret };
}

/**
 * Called from the modal after stripe.confirmSetup() succeeds. Reads
 * the SetupIntent server-side, retrieves its payment_method, and
 * persists it as the new default card on file. Idempotent: replaces
 * any existing default card.
 */
export async function recordCardFromSetupIntent(
  setupIntentId: string
): Promise<Result> {
  const me = await getPortalSelf();
  if (!me) return { ok: false, error: "no session" };

  let intent;
  try {
    intent = await stripe().setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "could not retrieve setup",
    };
  }
  if (intent.metadata?.astrabody_client_id !== me.clientId) {
    return { ok: false, error: "setup intent not yours" };
  }
  if (intent.status !== "succeeded") {
    return {
      ok: false,
      error: `setup status is ${intent.status}`,
    };
  }
  const pm = intent.payment_method;
  if (!pm || typeof pm === "string") {
    return { ok: false, error: "no payment method on setup intent" };
  }
  const r = await persistCardForClient({
    tenantId: me.tenantId,
    clientId: me.clientId,
    paymentMethod: pm,
    stripeCustomerId:
      typeof intent.customer === "string"
        ? intent.customer
        : intent.customer?.id ?? null,
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/portal/account");
  return { ok: true };
}

/**
 * Detach the saved card from Stripe and clear the denormalised columns
 * on clients + the client_payment_methods row. The Stripe Customer is
 * kept for future re-add (no need to recreate it).
 */
export async function removeSavedCard(): Promise<Result> {
  const me = await getPortalSelf();
  if (!me) return { ok: false, error: "no session" };

  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from("clients")
    .select("default_payment_method_id")
    .eq("id", me.clientId)
    .maybeSingle();

  const pmId = (client?.default_payment_method_id as string | null) ?? null;
  if (pmId) {
    try {
      await stripe().paymentMethods.detach(pmId);
    } catch (e) {
      // Detach can fail if the PM was already detached out-of-band. Log
      // and continue — we still want to clear our own DB pointer.
      console.warn("[removeSavedCard] detach failed:", e);
    }
    await admin
      .from("client_payment_methods")
      .delete()
      .eq("client_id", me.clientId)
      .eq("stripe_payment_method_id", pmId);
  }

  await admin
    .from("clients")
    .update({
      default_payment_method_id: null,
      card_brand: null,
      card_last4: null,
      card_exp_month: null,
      card_exp_year: null,
    })
    .eq("id", me.clientId);

  revalidatePath("/portal/account");
  return { ok: true };
}
