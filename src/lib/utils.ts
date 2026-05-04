import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The shadcn-standard `cn` helper. Composes class strings, then merges
 * conflicting Tailwind utilities (so `cn("px-2", "px-4")` → "px-4").
 * 21st.dev components rely on this being available at this exact path.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a money amount stored in pence as £X.XX. We always store
 * money in pence (integer) in the DB; this is the only place we
 * convert to a display string. Tabular nums make columns line up.
 */
export function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

/**
 * Format a points balance with thousands separator. Always integer.
 */
export function formatPoints(n: number): string {
  return new Intl.NumberFormat("en-GB").format(Math.round(n));
}

/**
 * The three loyalty tiers, in order. Used to rank progress and pick
 * tier-specific copy / colours.
 */
export const LOYALTY_TIERS = ["friend", "insider", "inner_circle"] as const;
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

export const TIER_COPY: Record<
  LoyaltyTier,
  { label: string; nextLabel: string; threshold: number }
> = {
  friend:       { label: "Friend",        nextLabel: "Insider",       threshold: 1500 },
  insider:      { label: "Insider",       nextLabel: "Inner Circle",  threshold: 10000 },
  inner_circle: { label: "Inner Circle",  nextLabel: "Inner Circle",  threshold: 10000 },
};
