"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { ProductCard } from "./ProductCard";
import { GiftSessionCard } from "./GiftSessionCard";
import type { ClientTier } from "@/lib/shop/pricing";
import type { ProductRow } from "@/lib/shop/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopData {
  products: ProductRow[];
  tier: ClientTier;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShopClient() {
  const { data, isLoading } = useSWR<ShopData>("/api/portal/shop");

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-4 pb-32">
        <header className="mb-4 px-2 py-3">
          <div className="h-7 w-16 animate-pulse rounded-full bg-olive/15" />
          <div className="mt-1 h-4 w-3/4 animate-pulse rounded-full bg-olive/10" />
        </header>
        <div className="mb-4">
          <div className="h-24 animate-pulse rounded-[20px] bg-sand/60" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-[20px] bg-sand/60"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const { products, tier } = data;

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="mb-4 px-2 py-3">
        <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Shop
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Tools and guides we&rsquo;ve made for clients who want to keep going
          between sessions.
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
