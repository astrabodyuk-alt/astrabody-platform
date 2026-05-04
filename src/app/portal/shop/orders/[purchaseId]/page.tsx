import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { OrderClient } from "./OrderClient";

/**
 * /portal/shop/orders/[purchaseId] — the post-payment delivery page.
 *
 * Shows a big sage "Download" button that mints a fresh signed URL
 * each time it's tapped. Audit row inserted into product_downloads
 * for every press. "Email me the link" is the fallback for iOS Safari.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/portal/login?next=/portal/shop/orders/${purchaseId}`);
  }

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) redirect("/portal/login");
  const clientId = link.client_id as string;

  const { data: rowRaw } = await admin
    .from("product_purchases")
    .select(
      "id, status, amount_pence, delivered_at, " +
        "products (name, slug, asset_url, cover_url)"
    )
    .eq("id", purchaseId)
    .eq("client_id", clientId)
    .maybeSingle();
  type EmbedProduct = {
    name: string;
    slug: string;
    asset_url: string | null;
    cover_url: string | null;
  };
  const row = rowRaw as unknown as
    | {
        id: string;
        status: string;
        amount_pence: number;
        delivered_at: string | null;
        products: EmbedProduct | EmbedProduct[] | null;
      }
    | null;
  if (!row) notFound();

  const productEmbed = row.products;
  const product = Array.isArray(productEmbed)
    ? productEmbed[0]
    : productEmbed;
  if (!product) notFound();

  return (
    <div className="px-4 pt-6 pb-32">
      <header className="mb-5">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Order delivery
        </p>
        <h1 className="mt-1 font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          {row.status === "paid"
            ? "Your download is ready"
            : "Almost there"}
        </h1>
        <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
          {product.name}
        </p>
      </header>

      <Card className="p-5">
        {row.status === "paid" ? (
          <OrderClient
            purchaseId={row.id}
            assetReady={!!product.asset_url}
          />
        ) : (
          <p className="text-[13px] tracking-snug text-olive-soft">
            We&rsquo;re still confirming your payment. Refresh in a few
            seconds. If this lingers, drop us a line and we&rsquo;ll sort
            it manually.
          </p>
        )}
      </Card>

      <p className="mt-5 text-center text-[12px] tracking-snug text-olive-soft">
        <Link href="/portal/shop" className="text-sage-deep hover:underline">
          ← Back to the shop
        </Link>
      </p>
    </div>
  );
}
