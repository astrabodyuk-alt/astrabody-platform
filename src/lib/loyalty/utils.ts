import { LOYALTY_TIERS, type LoyaltyTier } from "@/lib/utils";

/**
 * Numeric rank of a tier so we can compare. Lower index = lower tier.
 */
export function tierRank(tier: LoyaltyTier): number {
  return LOYALTY_TIERS.indexOf(tier);
}

export function tierQualifies(
  clientTier: LoyaltyTier,
  minTier: LoyaltyTier
): boolean {
  return tierRank(clientTier) >= tierRank(minTier);
}

/**
 * 8-character uppercase alphanumeric code, ambiguous chars stripped
 * (no 0/O/1/I). Not cryptographically random — fine for voucher /
 * invite codes since they are revocable and rate-limited at issue time.
 */
const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateShortCode(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += VOUCHER_ALPHABET.charAt(
      Math.floor(Math.random() * VOUCHER_ALPHABET.length)
    );
  }
  return result;
}

/**
 * Tier label shown in copy ("Insider only" pill). Mirrors TIER_COPY.label
 * but capitalised for the lock-pill UI.
 */
export function tierDisplayLabel(tier: LoyaltyTier): string {
  switch (tier) {
    case "friend":
      return "Friend";
    case "insider":
      return "Insider";
    case "inner_circle":
      return "Inner Circle";
  }
}
