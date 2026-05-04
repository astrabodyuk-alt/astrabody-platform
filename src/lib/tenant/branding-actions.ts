"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { FONT_PAIRS, normaliseHex } from "./brand-shared";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_FONT_HEADINGS = new Set(FONT_PAIRS.map((p) => p.heading));
const ALLOWED_FONT_BODIES = new Set(FONT_PAIRS.map((p) => p.body));

/**
 * Update the tenant brand colours + fonts. Owner / admin only. Hex
 * inputs are normalised to #RRGGBB; fonts are validated against the
 * curated allowlist (FONT_PAIRS) so a typo can't leave the tenant on
 * "Comic Sans".
 */
export async function updateTenantBranding(input: {
  primaryHex?: string | null;
  secondaryHex?: string | null;
  backgroundHex?: string | null;
  textHex?: string | null;
  accentHex?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const update: Record<string, unknown> = {};
  function setHex(field: string, raw: string | null | undefined): string | null {
    if (raw === undefined) return null;
    if (raw === null) {
      update[field] = null;
      return null;
    }
    const hex = normaliseHex(raw);
    if (!hex) return "invalid-hex";
    update[field] = hex;
    return null;
  }

  const errors: string[] = [];
  if (setHex("brand_primary_hex", input.primaryHex) === "invalid-hex")
    errors.push("primary");
  if (setHex("brand_secondary_hex", input.secondaryHex) === "invalid-hex")
    errors.push("secondary");
  if (setHex("brand_background_hex", input.backgroundHex) === "invalid-hex")
    errors.push("background");
  if (setHex("brand_text_hex", input.textHex) === "invalid-hex")
    errors.push("text");
  if (setHex("brand_accent_hex", input.accentHex) === "invalid-hex")
    errors.push("accent");
  if (errors.length > 0) {
    return { ok: false, error: `Invalid hex for ${errors.join(", ")}` };
  }

  if (input.fontHeading !== undefined) {
    if (input.fontHeading === null || input.fontHeading === "") {
      update.brand_font_heading = "Cormorant Garamond";
    } else if (!ALLOWED_FONT_HEADINGS.has(input.fontHeading)) {
      return { ok: false, error: "heading font not in allowlist" };
    } else {
      update.brand_font_heading = input.fontHeading;
    }
  }
  if (input.fontBody !== undefined) {
    if (input.fontBody === null || input.fontBody === "") {
      update.brand_font_body = "Inter";
    } else if (!ALLOWED_FONT_BODIES.has(input.fontBody)) {
      return { ok: false, error: "body font not in allowlist" };
    } else {
      update.brand_font_body = input.fontBody;
    }
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("tenants")
    .update(update)
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Upload a tenant logo to the public `tenant-logos` bucket. Server
 * resize via sharp to max 512×512 (preserve aspect ratio) and re-
 * encode as PNG so transparent logos keep their transparency.
 */
export async function uploadTenantLogo(input: {
  filename: string;
  base64: string;
  contentType: string;
}): Promise<Result<{ logoUrl: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    return { ok: false, error: "logo must be under 2 MB" };
  }
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(input.contentType)) {
    return { ok: false, error: "logo must be PNG, JPEG, WebP, or SVG" };
  }

  // SVG upload bypasses sharp (sharp rasterises SVG; we keep the
  // vector for crisp scaling in the header).
  let payload: Buffer;
  let storedExt: string;
  let storedContentType: string;
  if (/svg/i.test(input.contentType)) {
    payload = bytes;
    storedExt = "svg";
    storedContentType = "image/svg+xml";
  } else {
    try {
      payload = await sharp(bytes)
        .rotate()
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      storedExt = "png";
      storedContentType = "image/png";
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "image processing failed",
      };
    }
  }

  const admin = createAdminSupabase();
  const path = `${ctx.tenantId}/logo-${Date.now()}.${storedExt}`;
  const { error: uploadErr } = await admin.storage
    .from("tenant-logos")
    .upload(path, payload, {
      contentType: storedContentType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { data: pub } = admin.storage.from("tenant-logos").getPublicUrl(path);
  const logoUrl = pub.publicUrl;
  await admin
    .from("tenants")
    .update({ brand_logo_url: logoUrl })
    .eq("id", ctx.tenantId);

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true, logoUrl };
}

export async function removeTenantLogo(): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();
  await admin
    .from("tenants")
    .update({ brand_logo_url: null })
    .eq("id", ctx.tenantId);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Update the tenant's optional custom_domain. We just record the
 * value; actual DNS verification + Vercel API binding is post-deploy.
 */
export async function updateTenantCustomDomain(
  raw: string | null
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const trimmed = raw?.trim().toLowerCase() ?? "";
  let value: string | null = null;
  if (trimmed) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) {
      return { ok: false, error: "domain looks invalid" };
    }
    value = trimmed;
  }

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("tenants")
    .update({ custom_domain: value })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}
