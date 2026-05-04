"use server";

import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createProductDownloadUrl } from "@/lib/shop/storage";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Resolve the purchase the current portal client owns. RLS already
 * gates SELECT on product_purchases by client_id, so we just need to
 * confirm there's a session and the purchase status is 'paid'.
 */
async function getOwnedPurchase(purchaseId: string): Promise<{
  id: string;
  tenantId: string;
  productId: string;
  clientId: string;
  buyerEmail: string;
  status: string;
  productSlug: string;
  productName: string;
  productKind: "pdf" | "video" | "external_link";
  assetUrl: string | null;
} | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return null;
  const clientId = link.client_id as string;

  const { data: rowRaw } = await admin
    .from("product_purchases")
    .select(
      "id, tenant_id, product_id, client_id, buyer_email, status, " +
        "products (slug, name, kind, asset_url)"
    )
    .eq("id", purchaseId)
    .eq("client_id", clientId)
    .maybeSingle();
  type EmbedProduct = {
    slug: string;
    name: string;
    kind: "pdf" | "video" | "external_link";
    asset_url: string | null;
  };
  const row = rowRaw as unknown as
    | {
        id: string;
        tenant_id: string;
        product_id: string;
        client_id: string;
        buyer_email: string;
        status: string;
        products: EmbedProduct | EmbedProduct[] | null;
      }
    | null;
  if (!row) return null;
  const product = Array.isArray(row.products)
    ? row.products[0]
    : row.products;
  if (!product) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    clientId: row.client_id,
    buyerEmail: row.buyer_email,
    status: row.status,
    productSlug: product.slug,
    productName: product.name,
    productKind: product.kind,
    assetUrl: product.asset_url,
  };
}

/**
 * Mint a fresh 24-hour signed URL for the purchase + log the
 * download. Returns the URL the client should be redirected to. We
 * intentionally re-mint each time rather than reuse the persisted
 * `delivery_url` so an expired or yanked URL can't trap the buyer.
 */
export async function getDownloadUrlForPurchase(
  purchaseId: string
): Promise<Result<{ url: string }>> {
  const purchase = await getOwnedPurchase(purchaseId);
  if (!purchase) return { ok: false, error: "purchase not found" };
  if (purchase.status !== "paid") {
    return { ok: false, error: "purchase isn't paid yet" };
  }
  if (!purchase.assetUrl) {
    return { ok: false, error: "asset isn't uploaded yet" };
  }

  const url = await createProductDownloadUrl(
    purchase.assetUrl,
    `${purchase.productSlug}.${purchase.productKind === "video" ? "mp4" : "pdf"}`
  );
  if (!url) return { ok: false, error: "couldn't sign URL" };

  const admin = createAdminSupabase();
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await admin.from("product_downloads").insert({
    purchase_id: purchase.id,
    client_ip: ip,
  });
  // Refresh the persisted delivery_url so admin views can show "last
  // signed at …" without resigning.
  await admin
    .from("product_purchases")
    .update({ delivery_url: url })
    .eq("id", purchase.id);

  return { ok: true, url };
}

/**
 * Email the buyer the same signed URL — used by the "Email me the link"
 * fallback on the order page when iOS Safari throws a tantrum.
 */
export async function emailDownloadLinkForPurchase(
  purchaseId: string
): Promise<Result> {
  const purchase = await getOwnedPurchase(purchaseId);
  if (!purchase) return { ok: false, error: "purchase not found" };
  if (purchase.status !== "paid") {
    return { ok: false, error: "purchase isn't paid yet" };
  }

  const url = await createProductDownloadUrl(
    purchase.assetUrl,
    `${purchase.productSlug}.${purchase.productKind === "video" ? "mp4" : "pdf"}`
  );
  if (!url) return { ok: false, error: "couldn't sign URL" };

  const subject = `Your download: {{product.name}}`;
  const body = `Here's your download link for {{product.name}}.

[Download now]({{download.url}})

The link is valid for 24 hours. If it expires, hop back to your portal and tap the download button again, no charge.

Thank you for buying.

The Astrabody team`;

  const rendered = await renderEmail(subject, body, {
    product: { name: purchase.productName },
    download: { url },
  });
  await sendOne({
    tenantId: purchase.tenantId,
    templateId: null,
    clientId: purchase.clientId,
    toEmail: purchase.buyerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { ok: true };
}
