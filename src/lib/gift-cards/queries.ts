import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Re-export client-safe pieces so existing server-side imports keep
// working unchanged. Client code must import from "./shared".
export { describeGiftCardStatus } from "./shared";
export type { GiftCardRow } from "./shared";
import type { GiftCardRow } from "./shared";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid OCR confusion

/** 12-character upper-case alphanumeric code, hyphenated as XXXX-XXXX-XXXX. */
export function generateGiftCardCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars: string[] = [];
  for (const b of bytes) chars.push(ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars
    .slice(8, 12)
    .join("")}`;
}

/** Strip dashes / whitespace and upper-case for canonical lookup. */
export function normaliseGiftCardCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * Validate a code at checkout time. Resolves only when the card is
 * active (balance > 0, not expired, not voided). Tenant-scoped.
 */
export async function lookupActiveGiftCard(
  tenantId: string,
  rawCode: string
): Promise<
  | { ok: true; card: GiftCardRow }
  | { ok: false; reason: "not_found" | "expired" | "voided" | "empty" }
> {
  const code = normaliseGiftCardCode(rawCode);
  if (!code) return { ok: false, reason: "not_found" };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("gift_cards")
    .select(
      "id, tenant_id, code, initial_pence, balance_pence, purchased_by, recipient_email, recipient_name, personal_message, redeemed_by, redeemed_at, voided_at, expires_at, created_at"
    )
    .eq("tenant_id", tenantId)
    .ilike("code", code) // case-insensitive
    .maybeSingle();

  const card = data as GiftCardRow | null;
  if (!card) return { ok: false, reason: "not_found" };
  if (card.voided_at) return { ok: false, reason: "voided" };
  if (new Date(card.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (card.balance_pence <= 0) return { ok: false, reason: "empty" };
  return { ok: true, card };
}

