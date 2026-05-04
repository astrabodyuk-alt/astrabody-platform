import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  getActiveProductsForTenant,
  getCurrentClientTier,
} from "@/lib/shop/queries";
import { ProductCard } from "./ProductCard";
import { GiftSessionCard } from "./GiftSessionCard";

/**
 * /portal/shop — clean grid of digital products. The portal-browse RLS
 * on `products` already gates by tenant, so the user-scoped client
 * only ever sees her tenant's catalogue.
 *
 * Bottom-nav exposure of this route is conditional on tenant having
 * at least one active product (handled in BottomNav).
 */
export default async function ShopPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login?next=/portal/shop");

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id, clients (tenant_id)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) redirect("/portal/login");
  const clientId = link.client_id as string;
  type Embed = { tenant_id: string } | { tenant_id: string }[] | null;
  const tenantRow = link.clients as Embed;
  const tenantId = Array.isArray(tenantRow)
    ? tenantRow[0]?.tenant_id
    : tenantRow?.tenant_id;
  if (!tenantId) redirect("/portal/login");

  const [products, tier] = await Promise.all([
    getActiveProductsForTenant(tenantId),
    getCurrentClientTier(clientId),
  ]);

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="mb-4 px-2 py-3">
        <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Shop
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Tools and guides we&rsquo;ve made for clients who want to keep
          going between sessions.
        </p>
      </header>

      <div className="mb-4">
        <GiftSessionCard />
      </div>

      {products.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            Nothing else in the shop yet. Check back soon.
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} tier={tier} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
