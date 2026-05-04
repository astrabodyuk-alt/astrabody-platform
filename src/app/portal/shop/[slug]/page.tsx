import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { marked } from "marked";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  getProductBySlug,
  getCurrentClientTier,
} from "@/lib/shop/queries";
import { computeProductPrice } from "@/lib/shop/pricing";
import { BuyClient } from "./BuyClient";

/**
 * /portal/shop/[slug] — single product page.
 *
 * Sections (top → bottom):
 *   1. Cover + name + short pitch
 *   2. Long description (markdown → HTML, sanitised by marked)
 *   3. Optional preview thumbnail
 *   4. Price block (tier-aware) + Buy button (BuyClient handles
 *      the Stripe path or instant fulfilment for free-tier matches)
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/portal/login?next=/portal/shop/${slug}`);

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id, clients (tenant_id)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) redirect("/portal/login");
  type Embed = { tenant_id: string } | { tenant_id: string }[] | null;
  const tenantRow = link.clients as Embed;
  const tenantId = Array.isArray(tenantRow)
    ? tenantRow[0]?.tenant_id
    : tenantRow?.tenant_id;
  if (!tenantId) redirect("/portal/login");

  const product = await getProductBySlug(tenantId, slug);
  if (!product) notFound();

  const tier = await getCurrentClientTier(link.client_id as string);
  const price = computeProductPrice({
    pricePence: product.pricePence,
    memberDiscountPct: product.memberDiscountPct,
    freeForTier: product.freeForTier,
    tier,
  });

  const longHtml = product.longDescriptionMd
    ? (marked.parse(product.longDescriptionMd, { async: false }) as string)
    : "";

  return (
    <div className="px-4 pt-4 pb-32">
      <div className="mb-3">
        <Link
          href="/portal/shop"
          className="text-[13px] font-medium tracking-snug text-sage-deep"
        >
          ← All products
        </Link>
      </div>

      <Cover url={product.coverUrl} alt={product.name} />

      <header className="mt-5">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          {product.name}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed tracking-snug text-olive-soft">
          {product.shortPitch}
        </p>
      </header>

      {longHtml && (
        <div
          className="prose-email mt-5 text-[14px] leading-relaxed tracking-snug text-olive"
          dangerouslySetInnerHTML={{ __html: longHtml }}
        />
      )}

      {product.previewUrl && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Preview
          </p>
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[16px] border-[0.5px] border-hairline">
            <Image
              src={product.previewUrl}
              alt={`${product.name} preview`}
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </div>
      )}

      <BuyClient
        slug={product.slug}
        productName={product.name}
        price={price}
      />
    </div>
  );
}

function Cover({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="aspect-[16/9] w-full rounded-[16px]"
        style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      />
    );
  }
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[16px]">
      <Image
        src={url}
        alt={alt}
        fill
        sizes="100vw"
        className="object-cover"
      />
    </div>
  );
}
