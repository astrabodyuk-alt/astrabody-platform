"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import { computeProductPrice, type ClientTier } from "@/lib/shop/pricing";
import type { ProductRow } from "@/lib/shop/queries";

/**
 * Product grid card. Cover image (16:9, sage placeholder when missing),
 * name + short pitch, tier-aware price block, and a sage CTA. The
 * pricing block is the only conditional bit:
 *   - Studio Insider with free_for_tier match → "Yours, free" sage chip
 *   - Insider with member_discount_pct match → strike-through + new
 *   - Otherwise → standard price
 */
export function ProductCard({
  product,
  tier,
}: {
  product: ProductRow;
  tier: ClientTier;
}) {
  const price = computeProductPrice({
    pricePence: product.pricePence,
    memberDiscountPct: product.memberDiscountPct,
    freeForTier: product.freeForTier,
    tier,
  });

  return (
    <Link
      href={`/portal/shop/${product.slug}`}
      className="group block rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
    >
      <Card interactive className="overflow-hidden p-0">
        <Cover url={product.coverUrl} alt={product.name} />
        <div className="flex flex-col gap-2 p-4">
          <p className="font-serif text-[20px] font-medium leading-tight tracking-tight text-olive">
            {product.name}
          </p>
          <p className="text-[13px] leading-relaxed tracking-snug text-olive-soft">
            {product.shortPitch}
          </p>
          <PriceBlock price={price} />
          <span className="mt-2 inline-flex items-center self-start text-[13px] font-medium tracking-snug text-sage-deep">
            Get it
            <span aria-hidden className="ml-1 transition-transform duration-200 ease-ios group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </Card>
    </Link>
  );
}

function Cover({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="aspect-[16/9] w-full"
        style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      />
    );
  }
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden">
      <Image
        src={url}
        alt={alt}
        fill
        sizes="(min-width: 640px) 50vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}

function PriceBlock({
  price,
}: {
  price: ReturnType<typeof computeProductPrice>;
}) {
  if (price.reason === "free_studio_insider") {
    return (
      <span
        className="inline-flex items-center self-start rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
        style={{
          background: "rgba(117,133,100,0.16)",
          color: "#5C6B4E",
        }}
      >
        Yours, free
      </span>
    );
  }
  if (price.reason === "insider_discount") {
    return (
      <p className="text-[14px] tracking-snug">
        <span className="text-olive-soft line-through tabular-nums">
          {formatGBP(price.originalPence)}
        </span>{" "}
        <span className="font-medium tabular-nums text-sage-deep">
          {formatGBP(price.finalPence)}
        </span>{" "}
        <span className="text-[12px] text-olive-soft">with your Insider tier</span>
      </p>
    );
  }
  return (
    <p className="text-[16px] font-medium tabular-nums text-olive">
      {formatGBP(price.finalPence)}
    </p>
  );
}
