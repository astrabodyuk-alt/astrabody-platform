import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface ProductRow {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  shortPitch: string;
  longDescriptionMd: string | null;
  coverUrl: string | null;
  pricePence: number;
  currency: string;
  kind: "pdf" | "video" | "external_link";
  assetUrl: string | null;
  previewUrl: string | null;
  memberDiscountPct: number | null;
  freeForTier: "insider" | "studio_insider" | null;
  isActive: boolean;
  sortOrder: number;
}

const PRODUCT_COLS =
  "id, tenant_id, slug, name, short_pitch, long_description_md, " +
  "cover_url, price_pence, currency, kind, asset_url, preview_url, " +
  "member_discount_pct, free_for_tier, is_active, sort_order";

type RawProduct = {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  short_pitch: string;
  long_description_md: string | null;
  cover_url: string | null;
  price_pence: number;
  currency: string;
  kind: "pdf" | "video" | "external_link";
  asset_url: string | null;
  preview_url: string | null;
  member_discount_pct: number | null;
  free_for_tier: "insider" | "studio_insider" | null;
  is_active: boolean;
  sort_order: number;
};

function shape(row: RawProduct): ProductRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    name: row.name,
    shortPitch: row.short_pitch,
    longDescriptionMd: row.long_description_md,
    coverUrl: row.cover_url,
    pricePence: row.price_pence,
    currency: row.currency,
    kind: row.kind,
    assetUrl: row.asset_url,
    previewUrl: row.preview_url,
    memberDiscountPct: row.member_discount_pct,
    freeForTier: row.free_for_tier,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

/**
 * Active products for the current tenant, ordered for display. Uses
 * the user-scoped client so RLS gates on the portal-browse policy.
 */
export async function getActiveProductsForTenant(
  tenantId: string
): Promise<ProductRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLS)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as unknown as RawProduct[]).map(shape);
}

/**
 * Tenant-wide count of active products. Used by the portal layout to
 * decide whether to render the "Shop" bottom-nav item. Read via the
 * service-role client so an unauthenticated layout pre-render works.
 */
export async function countActiveProductsForTenant(
  tenantId: string
): Promise<number> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  return count ?? 0;
}

/**
 * One product by slug. Returns null when missing / inactive / wrong
 * tenant.
 */
export async function getProductBySlug(
  tenantId: string,
  slug: string
): Promise<ProductRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLS)
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as RawProduct;
  if (!row.is_active) return null;
  return shape(row);
}

/**
 * The current portal client's loyalty tier. Live-read against
 * loyalty_accounts so a freshly promoted Insider sees the discount on
 * the next page load. Returns null when no account yet (the first-time
 * wallet bootstrap creates one on next login).
 */
export async function getCurrentClientTier(
  clientId: string
): Promise<"friend" | "insider" | "inner_circle" | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("tier")
    .eq("client_id", clientId)
    .maybeSingle();
  const t = (data?.tier as string | null) ?? null;
  if (t === "friend" || t === "insider" || t === "inner_circle") return t;
  return null;
}

export interface PurchaseRow {
  id: string;
  tenantId: string;
  productId: string;
  clientId: string | null;
  buyerEmail: string;
  amountPence: number;
  stripePaymentIntent: string | null;
  status: "pending" | "paid" | "refunded";
  deliveryUrl: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/** One purchase by id, scoped to the calling user via RLS. */
export async function getPurchaseById(id: string): Promise<PurchaseRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("product_purchases")
    .select(
      "id, tenant_id, product_id, client_id, buyer_email, amount_pence, " +
        "stripe_payment_intent, status, delivery_url, delivered_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    tenant_id: string;
    product_id: string;
    client_id: string | null;
    buyer_email: string;
    amount_pence: number;
    stripe_payment_intent: string | null;
    status: "pending" | "paid" | "refunded";
    delivery_url: string | null;
    delivered_at: string | null;
    created_at: string;
  };
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    clientId: row.client_id,
    buyerEmail: row.buyer_email,
    amountPence: row.amount_pence,
    stripePaymentIntent: row.stripe_payment_intent,
    status: row.status,
    deliveryUrl: row.delivery_url,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}
