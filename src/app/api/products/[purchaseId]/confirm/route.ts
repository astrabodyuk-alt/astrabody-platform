import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createProductDownloadUrl } from "@/lib/shop/storage";

/**
 * Stripe redirects here after confirmPayment(). On success:
 *   - Re-verify the PaymentIntent server-side (don't trust the
 *     redirect alone).
 *   - Confirm the metadata.purchase_id matches the route param.
 *   - Flip product_purchases.status='paid' + delivered_at=now() if
 *     still pending. Idempotent — re-hits are safe.
 *   - Mint a fresh signed URL and persist as `delivery_url` so the
 *     order page lands ready-to-download.
 *   - Redirect to /portal/shop/orders/<purchaseId>.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
): Promise<Response> {
  const { purchaseId } = await params;
  const url = new URL(request.url);
  const paymentIntentId = url.searchParams.get("payment_intent");

  if (!paymentIntentId) {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=missing_payment_intent`
    );
  }

  let pi;
  try {
    pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error("[products/confirm] retrieve failed:", err);
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=payment_lookup_failed`
    );
  }

  if (pi.status !== "succeeded" && pi.status !== "processing") {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=payment_not_succeeded`
    );
  }

  if (
    pi.metadata?.astrabody_kind !== "product" ||
    pi.metadata?.astrabody_purchase_id !== purchaseId
  ) {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=purchase_mismatch`
    );
  }

  const admin = createAdminSupabase();

  // Idempotent flip + mint signed URL.
  const { data: row } = await admin
    .from("product_purchases")
    .update({
      status: "paid",
      delivered_at: new Date().toISOString(),
      stripe_payment_intent: paymentIntentId,
    })
    .eq("id", purchaseId)
    .select(
      "id, products (slug, kind, asset_url)"
    )
    .single();

  if (row) {
    type Embed =
      | { slug: string; kind: string; asset_url: string | null }
      | { slug: string; kind: string; asset_url: string | null }[]
      | null;
    const product = (() => {
      const e = row.products as Embed;
      return Array.isArray(e) ? e[0] : e;
    })();
    if (product?.asset_url) {
      const filenameExt = product.kind === "video" ? "mp4" : "pdf";
      const signed = await createProductDownloadUrl(
        product.asset_url,
        `${product.slug}.${filenameExt}`
      );
      if (signed) {
        await admin
          .from("product_purchases")
          .update({ delivery_url: signed })
          .eq("id", purchaseId);
      }
    }
  }

  return NextResponse.redirect(
    `${url.origin}/portal/shop/orders/${purchaseId}`
  );
}
