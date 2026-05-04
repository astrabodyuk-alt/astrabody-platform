/**
 * Client-safe pieces for the gift-cards system. The server-only
 * lookups + RNG live in queries.ts; anything client code (admin tab,
 * checkout row) needs lands here.
 */

export interface GiftCardRow {
  id: string;
  tenant_id: string;
  code: string;
  initial_pence: number;
  balance_pence: number;
  purchased_by: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  personal_message: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  voided_at: string | null;
  expires_at: string;
  created_at: string;
}

/** Status label for the admin table. Pure. */
export function describeGiftCardStatus(
  card: Pick<GiftCardRow, "balance_pence" | "voided_at" | "expires_at">
): "active" | "redeemed" | "voided" | "expired" {
  if (card.voided_at) return "voided";
  if (card.balance_pence <= 0) return "redeemed";
  if (new Date(card.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}
