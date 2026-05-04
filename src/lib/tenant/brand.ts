import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Re-export client-safe pieces so existing server-side imports of
// these from "@/lib/tenant/brand" keep working unchanged. Client code
// must import directly from "@/lib/tenant/brand-shared".
export {
  FONT_PAIRS,
  contrastRatio,
  hexToHslTriplet,
  normaliseHex,
} from "./brand-shared";
export type { FontPair, TenantBrand } from "./brand-shared";
import type { TenantBrand } from "./brand-shared";

const ASTRABODY_DEFAULT: Omit<TenantBrand, "id" | "slug" | "name"> = {
  logoUrl: null,
  primaryHex: "#5C6B4E",
  secondaryHex: "#BBC4AA",
  backgroundHex: "#F6F3EE",
  textHex: "#3E3E31",
  accentHex: "#758564",
  fontHeading: "Cormorant Garamond",
  fontBody: "Inter",
  subdomain: null,
  customDomain: null,
  timezone: "Europe/London",
};

const SELECT_COLS =
  "id, slug, name, brand_logo_url, brand_primary_hex, brand_secondary_hex, " +
  "brand_background_hex, brand_text_hex, brand_accent_hex, " +
  "brand_font_heading, brand_font_body, subdomain, custom_domain, timezone";

/**
 * Resolve the current tenant from the host header set by middleware:
 *
 *   1. Custom domain match → that tenant
 *   2. <slug>.atavoplatform.com → look up by subdomain (then by slug)
 *   3. <slug>.localhost:<port> → same lookup (local dev)
 *   4. Otherwise → NEXT_PUBLIC_DEFAULT_TENANT_SLUG ('astrabody' for V1)
 *
 * Cached per request via React.cache so multiple server components in
 * the same render share one DB hit.
 */
export const getCurrentTenantBrand = cache(async (): Promise<TenantBrand> => {
  const h = await headers();
  const slugHint = h.get("x-tenant-host-slug");
  const customHint = h.get("x-tenant-custom-domain");

  const admin = createAdminSupabase();

  if (customHint) {
    const { data } = await admin
      .from("tenants")
      .select(SELECT_COLS)
      .eq("custom_domain", customHint)
      .maybeSingle();
    if (data) return shape(data as unknown as Record<string, unknown>);
  }

  if (slugHint) {
    const { data: bySub } = await admin
      .from("tenants")
      .select(SELECT_COLS)
      .eq("subdomain", slugHint)
      .maybeSingle();
    if (bySub) return shape(bySub as unknown as Record<string, unknown>);

    const { data: bySlug } = await admin
      .from("tenants")
      .select(SELECT_COLS)
      .eq("slug", slugHint)
      .maybeSingle();
    if (bySlug) return shape(bySlug as unknown as Record<string, unknown>);
  }

  const fallbackSlug =
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? "astrabody";
  const { data: fallback } = await admin
    .from("tenants")
    .select(SELECT_COLS)
    .eq("slug", fallbackSlug)
    .maybeSingle();
  if (fallback) return shape(fallback as unknown as Record<string, unknown>);

  // Last-ditch fallback when no tenant exists at all (fresh install).
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: fallbackSlug,
    name: "Astrabody",
    ...ASTRABODY_DEFAULT,
  };
});

function shape(row: Record<string, unknown>): TenantBrand {
  return {
    id: (row.id as string) ?? "",
    slug: (row.slug as string) ?? "",
    name: (row.name as string) ?? "",
    logoUrl: (row.brand_logo_url as string | null) ?? null,
    primaryHex:
      (row.brand_primary_hex as string | null) ??
      ASTRABODY_DEFAULT.primaryHex,
    secondaryHex:
      (row.brand_secondary_hex as string | null) ??
      ASTRABODY_DEFAULT.secondaryHex,
    backgroundHex:
      (row.brand_background_hex as string | null) ??
      ASTRABODY_DEFAULT.backgroundHex,
    textHex:
      (row.brand_text_hex as string | null) ?? ASTRABODY_DEFAULT.textHex,
    accentHex:
      (row.brand_accent_hex as string | null) ?? ASTRABODY_DEFAULT.accentHex,
    fontHeading:
      (row.brand_font_heading as string | null) ??
      ASTRABODY_DEFAULT.fontHeading,
    fontBody:
      (row.brand_font_body as string | null) ?? ASTRABODY_DEFAULT.fontBody,
    subdomain: (row.subdomain as string | null) ?? null,
    customDomain: (row.custom_domain as string | null) ?? null,
    timezone:
      (row.timezone as string | null) ?? ASTRABODY_DEFAULT.timezone,
  };
}
