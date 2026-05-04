/**
 * Tier-aware price computation for digital products.
 *
 * Tiers come from loyalty_accounts.tier — the existing CHECK is
 * ('friend','insider','inner_circle'). The product spec uses the
 * brand-name "studio_insider" for the top tier; we treat that as an
 * alias of 'inner_circle' here so the catalogue field stays
 * marketing-friendly without forking the loyalty enum.
 */

export type ClientTier = "friend" | "insider" | "inner_circle" | null;

export interface ProductPriceInputs {
  pricePence: number;
  memberDiscountPct: number | null;
  freeForTier: "insider" | "studio_insider" | null;
  tier: ClientTier;
}

export interface PriceResult {
  /** What the buyer pays (pence). 0 means free. */
  finalPence: number;
  /** True when zero price + a tier match; UI skips Stripe. */
  free: boolean;
  /** Set when the tier discount or free-for-tier kicks in. */
  reason: "free_studio_insider" | "insider_discount" | null;
  /** Pre-discount price (so the UI can strike-through it). */
  originalPence: number;
}

/**
 * Match the spec's free_for_tier value against an actual tier:
 *   - free_for_tier='insider'         → match if tier in (insider, inner_circle)
 *   - free_for_tier='studio_insider'  → match only if tier='inner_circle'
 *     (we treat "studio_insider" as a brand-name alias for the top tier)
 */
function tierUnlocksFree(
  freeForTier: "insider" | "studio_insider" | null,
  tier: ClientTier
): boolean {
  if (!freeForTier || !tier) return false;
  if (freeForTier === "studio_insider") return tier === "inner_circle";
  return tier === "insider" || tier === "inner_circle";
}

/**
 * Whether the (Insider+) member-discount applies. Insiders and Inner
 * Circle members both get the percent off; Inner Circle additionally
 * gets free if free_for_tier matches.
 */
function tierUnlocksDiscount(tier: ClientTier): boolean {
  return tier === "insider" || tier === "inner_circle";
}

export function computeProductPrice(input: ProductPriceInputs): PriceResult {
  const original = Math.max(0, Math.round(input.pricePence));
  if (tierUnlocksFree(input.freeForTier, input.tier)) {
    return {
      finalPence: 0,
      free: true,
      reason: "free_studio_insider",
      originalPence: original,
    };
  }
  const pct = input.memberDiscountPct ?? 0;
  if (pct > 0 && tierUnlocksDiscount(input.tier)) {
    const final = Math.max(0, Math.round((original * (100 - pct)) / 100));
    return {
      finalPence: final,
      free: final === 0,
      reason: "insider_discount",
      originalPence: original,
    };
  }
  return {
    finalPence: original,
    free: original === 0,
    reason: null,
    originalPence: original,
  };
}
