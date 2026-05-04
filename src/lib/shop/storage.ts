import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const PRIVATE_BUCKET = "products-private";
const PUBLIC_BUCKET = "products-public";

const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60; // 24h

/**
 * Generate a fresh signed URL for a private product asset. The result
 * carries content-disposition=attachment so iOS Safari treats it as a
 * download instead of opening it inline. We point at the file's basename
 * for the saved filename.
 *
 * Returns null when the path is unset or Supabase rejects the sign.
 */
export async function createProductDownloadUrl(
  assetPath: string | null,
  filenameHint: string
): Promise<string | null> {
  if (!assetPath) return null;
  const cleanPath = assetPath.replace(/^\/+/, "");
  const filename = cleanFilename(filenameHint, cleanPath);
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS, {
      download: filename,
    });
  if (error || !data?.signedUrl) {
    console.warn("[createProductDownloadUrl] sign failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Public URL for a covers/previews bucket object. */
export function publicAssetUrl(path: string | null): string | null {
  if (!path) return null;
  const cleanPath = path.replace(/^\/+/, "");
  const admin = createAdminSupabase();
  const { data } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(cleanPath);
  return data.publicUrl;
}

/**
 * Upload a cover image / preview to the public bucket. Caller passes
 * an ArrayBuffer (server actions convert from FormData). Returns the
 * storage path on success.
 */
export async function uploadPublicAsset(input: {
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(input.path, input.bytes, {
      contentType: input.contentType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path: input.path };
}

/** Upload a private asset (the actual product file). */
export async function uploadPrivateAsset(input: {
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const admin = createAdminSupabase();
  const { error } = await admin.storage
    .from(PRIVATE_BUCKET)
    .upload(input.path, input.bytes, {
      contentType: input.contentType,
      upsert: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path: input.path };
}

function cleanFilename(hint: string, fallbackPath: string): string {
  const candidate =
    (hint || fallbackPath.split("/").pop() || "download")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  return candidate.length > 0 ? candidate : "download";
}
