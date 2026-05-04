"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  getProductBySlug,
  getCurrentClientTier,
} from "@/lib/shop/queries";
import { computeProductPrice } from "@/lib/shop/pricing";
import { createProductDownloadUrl } from "@/lib/shop/storage";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Resolve the current portal client. Used by the buy + confirm flows.
 * Both flows require a signed-in client — anonymous purchase is out of
 * scope for V1.
 */
async function getSelf(): Promise<{
  clientId: string;
  tenantId: string;
  email: string;
} | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id, clients (tenant_id, email)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return null;
  type Embed =
    | { tenant_id: string; email: string | null }
    | { tenant_id: string; email: string | null }[]
    | null;
  const e = link.clients as Embed;
  const row = Array.isArray(e) ? e[0] : e;
  if (!row?.tenant_id) return null;
  return {
    clientId: link.client_id as string,
    tenantId: row.tenant_id,
    email: row.email ?? user.email ?? "",
  };
}

/**
 * Create or reuse a product purchase + Stripe PaymentIntent. When the
 * client's tier unlocks free_for_tier, skip Stripe entirely and
 * fulfil immediately.
 *
 * Idempotency: in V1 we always create a new row. (Stripe's idempotency
 * key would dedupe on accidental double-tap; the next prompt can wire
 * that if needed.)
 */
export async function createProductIntent(
  slug: string
): Promise<
  | { ok: true; free: true; purchaseId: string }
  | { ok: true; free: false; purchaseId: string; clientSecret: string }
  | { ok: false; error: string }
> {
  const me = await getSelf();
  if (!me) return { ok: false, error: "no session" };

  const product = await getProductBySlug(me.tenantId, slug);
  if (!product || !product.isActive) {
    return { ok: false, error: "product not found" };
  }

  const tier = await getCurrentClientTier(me.clientId);
  const price = computeProductPrice({
    pricePence: product.pricePence,
    memberDiscountPct: product.memberDiscountPct,
    freeForTier: product.freeForTier,
    tier,
  });

  const admin = createAdminSupabase();

  // Free path: insert paid row + initial signed URL, no Stripe.
  if (price.free) {
    const signedUrl = await createProductDownloadUrl(
      product.assetUrl,
      `${product.slug}.pdf`
    );
    const { data: row, error } = await admin
      .from("product_purchases")
      .insert({
        tenant_id: me.tenantId,
        product_id: product.id,
        client_id: me.clientId,
        buyer_email: me.email,
        amount_pence: 0,
        status: "paid",
        delivery_url: signedUrl,
        delivered_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) {
      return { ok: false, error: error?.message ?? "couldn't fulfil" };
    }
    revalidatePath("/portal/shop");
    return { ok: true, free: true, purchaseId: row.id as string };
  }

  // Paid path: insert pending row, build a PaymentIntent, return its
  // client_secret to the buyer.
  const { data: row, error: insertError } = await admin
    .from("product_purchases")
    .insert({
      tenant_id: me.tenantId,
      product_id: product.id,
      client_id: me.clientId,
      buyer_email: me.email,
      amount_pence: price.finalPence,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !row) {
    return { ok: false, error: insertError?.message ?? "couldn't queue" };
  }
  const purchaseId = row.id as string;

  try {
    const intent = await stripe().paymentIntents.create({
      amount: price.finalPence,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      description: `${product.name} — Astrabody product purchase`,
      metadata: {
        astrabody_kind: "product",
        astrabody_purchase_id: purchaseId,
        astrabody_product_id: product.id,
        astrabody_tenant_id: me.tenantId,
      },
    });
    if (!intent.client_secret) throw new Error("no client_secret");
    await admin
      .from("product_purchases")
      .update({ stripe_payment_intent: intent.id })
      .eq("id", purchaseId);
    return {
      ok: true,
      free: false,
      purchaseId,
      clientSecret: intent.client_secret,
    };
  } catch (e) {
    // Roll back the pending row so the user doesn't see a phantom
    // purchase in /admin/shop.
    await admin.from("product_purchases").delete().eq("id", purchaseId);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Stripe setup failed",
    };
  }
}
