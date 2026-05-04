import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { CatalogTab } from "./CatalogTab";
import { SalesTab, type SaleRow } from "./SalesTab";
import { StatsTab, type StatsShape } from "./StatsTab";

/**
 * /admin/shop — owner / admin gated. Three tabs:
 *
 *   Catalog: list + per-product editor (cover + asset upload)
 *   Sales:   ledger of product_purchases + resend-link drawer
 *   Stats:   monthly KPI cards
 */
export default async function AdminShopPage() {
  const ctx = await getAdminContextOrRedirect();
  if (!ctx.isOwnerOrAdmin) redirect("/admin");

  const supabase = await createServerSupabase();

  const TZ = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [year, month] = ymd.split("-").map(Number);
  const monthStart = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    TZ
  );

  const [productsResult, salesResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, name, short_pitch, long_description_md, cover_url, " +
          "price_pence, kind, asset_url, preview_url, member_discount_pct, " +
          "free_for_tier, is_active, sort_order, created_at"
      )
      .eq("tenant_id", ctx.tenantId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_purchases")
      .select(
        "id, amount_pence, status, created_at, delivered_at, buyer_email, " +
          "products (id, name, slug), clients (id, full_name, email)"
      )
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const products = (productsResult.data ?? []) as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    short_pitch: string;
    long_description_md: string | null;
    cover_url: string | null;
    price_pence: number;
    kind: "pdf" | "video" | "external_link";
    asset_url: string | null;
    preview_url: string | null;
    member_discount_pct: number | null;
    free_for_tier: "insider" | "studio_insider" | null;
    is_active: boolean;
    sort_order: number;
    created_at: string;
  }>;

  const sales = ((salesResult.data ?? []) as unknown as Array<{
    id: string;
    amount_pence: number;
    status: string;
    created_at: string;
    delivered_at: string | null;
    buyer_email: string;
    products:
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    clients:
      | { id: string; full_name: string | null; email: string | null }
      | { id: string; full_name: string | null; email: string | null }[]
      | null;
  }>).map<SaleRow>((r) => {
    const product = pickFirst<{ id: string; name: string; slug: string }>(
      r.products
    );
    const client = pickFirst<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>(r.clients);
    return {
      id: r.id,
      amountPence: r.amount_pence,
      status: r.status as "pending" | "paid" | "refunded",
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      buyerEmail: r.buyer_email,
      productId: product?.id ?? null,
      productName: product?.name ?? "—",
      clientId: client?.id ?? null,
      clientName: client?.full_name ?? client?.email ?? null,
    };
  });

  // KPIs
  const paidSales = sales.filter((s) => s.status === "paid");
  const thisMonth = paidSales.filter(
    (s) => new Date(s.createdAt) >= monthStart
  );
  const revenuePence = thisMonth.reduce((acc, s) => acc + s.amountPence, 0);
  const aov =
    thisMonth.length > 0 ? Math.round(revenuePence / thisMonth.length) : 0;

  // Top product (by sales count, this month).
  const counts = new Map<string, { name: string; count: number }>();
  for (const s of thisMonth) {
    const key = s.productId ?? "—";
    const prev = counts.get(key) ?? {
      name: s.productName,
      count: 0,
    };
    prev.count += 1;
    counts.set(key, prev);
  }
  const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];

  const stats: StatsShape = {
    monthSold: thisMonth.length,
    revenuePence,
    topProductName: top?.name ?? null,
    topProductSold: top?.count ?? 0,
    averageOrderPence: aov,
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Shop
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Digital products you sell to your clients.
        </p>
      </header>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab products={products} />
        </TabsContent>

        <TabsContent value="sales">
          {sales.length === 0 ? (
            <Card className="p-5">
              <p className="text-[13px] tracking-snug text-olive-soft">
                No sales yet. Once a client buys, the row appears here.
              </p>
            </Card>
          ) : (
            <SalesTab sales={sales} />
          )}
        </TabsContent>

        <TabsContent value="stats">
          <StatsTab stats={stats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
