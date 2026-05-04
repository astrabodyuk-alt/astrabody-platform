"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  uploadPublicAsset,
  uploadPrivateAsset,
  publicAssetUrl,
  createProductDownloadUrl,
} from "@/lib/shop/storage";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_COVER_BYTES = 1 * 1024 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/**
 * Upsert a product. Owner / admin only. Cover + asset uploads happen
 * via separate actions below; this one just persists metadata.
 */
export async function upsertProduct(input: {
  id?: string;
  slug: string;
  name: string;
  shortPitch: string;
  longDescriptionMd?: string | null;
  pricePence: number;
  kind: "pdf" | "video" | "external_link";
  assetUrl?: string | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  memberDiscountPct?: number;
  freeForTier?: "insider" | "studio_insider" | null;
  isActive: boolean;
  sortOrder?: number;
}): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const slug = input.slug.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "slug must be lowercase letters, numbers, hyphens" };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "name is required" };
  const pitch = input.shortPitch.trim();
  if (!pitch) return { ok: false, error: "short pitch is required" };
  if (!Number.isFinite(input.pricePence) || input.pricePence < 0) {
    return { ok: false, error: "price can't be negative" };
  }

  const admin = createAdminSupabase();
  const row = {
    tenant_id: ctx.tenantId,
    slug,
    name,
    short_pitch: pitch,
    long_description_md: input.longDescriptionMd?.trim() || null,
    price_pence: Math.round(input.pricePence),
    kind: input.kind,
    asset_url: input.assetUrl?.trim() || null,
    cover_url: input.coverUrl?.trim() || null,
    preview_url: input.previewUrl?.trim() || null,
    member_discount_pct: clampInt(input.memberDiscountPct ?? 0, 0, 100),
    free_for_tier: input.freeForTier ?? null,
    is_active: input.isActive,
    sort_order: clampInt(input.sortOrder ?? 100, 0, 9999),
  };

  if (input.id) {
    const { data: existing } = await admin
      .from("products")
      .select("tenant_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.tenant_id !== ctx.tenantId) {
      return { ok: false, error: "product not in your tenant" };
    }
    const { error } = await admin
      .from("products")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/shop");
    revalidatePath("/portal/shop");
    return { ok: true, id: input.id };
  }
  const { data: created, error } = await admin
    .from("products")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "couldn't save" };
  }
  revalidatePath("/admin/shop");
  revalidatePath("/portal/shop");
  return { ok: true, id: created.id as string };
}

/**
 * Upload a cover image. Server-side resize via sharp: cap at 1280×720
 * and re-encode as JPEG for consistency. Caller passes a base64 data
 * URL (FormData would also work, but this is simpler from a client
 * action).
 */
export async function uploadCoverImage(input: {
  productId: string;
  filename: string;
  /** base64-encoded bytes of the original image. */
  base64: string;
  contentType: string;
}): Promise<Result<{ coverUrl: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.byteLength > MAX_COVER_BYTES) {
    return { ok: false, error: "cover must be under 1 MB" };
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(input.contentType)) {
    return { ok: false, error: "cover must be PNG, JPEG, or WebP" };
  }

  let resized: Buffer;
  try {
    resized = await sharp(bytes)
      .rotate()
      .resize({ width: 1280, height: 720, fit: "cover" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "image resize failed",
    };
  }

  const admin = createAdminSupabase();
  const { data: product } = await admin
    .from("products")
    .select("slug, tenant_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product || product.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "product not in your tenant" };
  }

  const path = `${product.slug}/cover-${Date.now()}.jpg`;
  const up = await uploadPublicAsset({
    path,
    bytes: resized.buffer.slice(
      resized.byteOffset,
      resized.byteOffset + resized.byteLength
    ) as ArrayBuffer,
    contentType: "image/jpeg",
  });
  if (!up.ok) return { ok: false, error: up.error };

  const publicUrl = publicAssetUrl(path);
  if (!publicUrl) return { ok: false, error: "couldn't read public URL" };

  await admin
    .from("products")
    .update({ cover_url: publicUrl })
    .eq("id", input.productId);

  revalidatePath("/admin/shop");
  revalidatePath("/portal/shop");
  return { ok: true, coverUrl: publicUrl };
}

/**
 * Upload the actual product asset (PDF / video) to the private bucket.
 * Path is `<tenantSlug>/<productSlug>.<ext>` so admins can re-upload
 * without churning the asset_url.
 */
export async function uploadProductAsset(input: {
  productId: string;
  filename: string;
  base64: string;
  contentType: string;
}): Promise<Result<{ assetPath: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    return { ok: false, error: "asset must be under 50 MB" };
  }

  const admin = createAdminSupabase();
  const { data: product } = await admin
    .from("products")
    .select("slug, tenant_id, kind")
    .eq("id", input.productId)
    .maybeSingle();
  if (!product || product.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "product not in your tenant" };
  }
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("slug")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const tenantSlug = (tenantRow?.slug as string | undefined) ?? "tenant";

  const ext =
    product.kind === "video"
      ? "mp4"
      : input.filename.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${tenantSlug}/${product.slug}.${ext}`;
  const up = await uploadPrivateAsset({
    path,
    bytes: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer,
    contentType: input.contentType,
  });
  if (!up.ok) return { ok: false, error: up.error };

  await admin
    .from("products")
    .update({ asset_url: path })
    .eq("id", input.productId);

  revalidatePath("/admin/shop");
  return { ok: true, assetPath: path };
}

/**
 * Resend a download link to the buyer's email. Owner / admin only.
 * Mints a fresh 24h signed URL each call.
 */
export async function resendDownloadLink(
  purchaseId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();
  const { data: rowRaw } = await admin
    .from("product_purchases")
    .select(
      "id, tenant_id, client_id, buyer_email, status, " +
        "products (slug, name, kind, asset_url)"
    )
    .eq("id", purchaseId)
    .eq("tenant_id", ctx.tenantId)
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
        client_id: string | null;
        buyer_email: string;
        status: string;
        products: EmbedProduct | EmbedProduct[] | null;
      }
    | null;
  if (!row) return { ok: false, error: "purchase not found" };
  if (row.status !== "paid") {
    return { ok: false, error: "purchase isn't paid" };
  }
  const product = Array.isArray(row.products)
    ? row.products[0]
    : row.products;
  if (!product?.asset_url) {
    return { ok: false, error: "asset isn't uploaded yet" };
  }
  const ext = product.kind === "video" ? "mp4" : "pdf";
  const signed = await createProductDownloadUrl(
    product.asset_url,
    `${product.slug}.${ext}`
  );
  if (!signed) return { ok: false, error: "couldn't sign URL" };

  const subject = `Your download: {{product.name}}`;
  const body = `Here&rsquo;s a fresh download link for {{product.name}}.

[Download now]({{download.url}})

Valid for 24 hours. If you need it again, ask anytime.

The Astrabody team`;
  const rendered = await renderEmail(subject, body, {
    product: { name: product.name },
    download: { url: signed },
  });
  await sendOne({
    tenantId: row.tenant_id,
    templateId: null,
    clientId: row.client_id,
    toEmail: row.buyer_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { ok: true };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
