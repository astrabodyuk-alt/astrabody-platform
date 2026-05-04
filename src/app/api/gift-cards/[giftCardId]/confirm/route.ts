import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  sendGiftCardBuyerEmail,
  sendGiftCardRecipientEmail,
} from "@/lib/gift-cards/email";

/**
 * Stripe redirects here after the buyer confirms a gift-card payment.
 *   - Re-verify the PaymentIntent server-side.
 *   - Confirm the metadata.gift_card_id matches the route param.
 *   - Activate the card (balance_pence = initial_pence) — idempotent.
 *   - Send the recipient + buyer emails (best-effort).
 *   - Redirect to /portal/shop?giftSent=1 with a success flag.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ giftCardId: string }> }
): Promise<Response> {
  const { giftCardId } = await params;
  const url = new URL(request.url);
  const paymentIntentId = url.searchParams.get("payment_intent");

  if (!paymentIntentId) {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=missing_payment_intent`
    );
  }

  let pi;
  try {
    pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error("[gift-card/confirm] retrieve failed:", err);
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=payment_lookup_failed`
    );
  }

  if (pi.status !== "succeeded" && pi.status !== "processing") {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=payment_not_succeeded`
    );
  }

  if (
    pi.metadata?.astrabody_kind !== "gift_card" ||
    pi.metadata?.astrabody_gift_card_id !== giftCardId
  ) {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=metadata_mismatch`
    );
  }

  const admin = createAdminSupabase();
  const { data: card } = await admin
    .from("gift_cards")
    .select(
      "id, tenant_id, code, initial_pence, balance_pence, recipient_email, recipient_name, personal_message, purchased_by, expires_at"
    )
    .eq("id", giftCardId)
    .maybeSingle();
  if (!card) {
    return NextResponse.redirect(
      `${url.origin}/portal/shop?error=gift_card_not_found`
    );
  }

  // Idempotent activation — only fire emails once even if the user
  // re-hits the URL.
  const alreadyActivated = (card.balance_pence as number) > 0;
  if (!alreadyActivated) {
    await admin
      .from("gift_cards")
      .update({ balance_pence: card.initial_pence as number })
      .eq("id", giftCardId);

    // Look up the buyer's name + email for the buyer confirmation copy.
    let buyerName = "A friend";
    let buyerEmail: string | null = null;
    if (card.purchased_by) {
      const { data: buyer } = await admin
        .from("clients")
        .select("full_name, email")
        .eq("id", card.purchased_by)
        .maybeSingle();
      if (buyer) {
        buyerName = (buyer.full_name as string | null)?.split(/\s+/)[0] ?? buyerName;
        buyerEmail = (buyer.email as string | null) ?? null;
      }
    }

    if (card.recipient_email && card.recipient_name) {
      void sendGiftCardRecipientEmail({
        tenantId: card.tenant_id as string,
        giftCardId: card.id as string,
        code: card.code as string,
        amountPence: card.initial_pence as number,
        recipientName: card.recipient_name as string,
        recipientEmail: card.recipient_email as string,
        personalMessage:
          (card.personal_message as string | null | undefined) ?? null,
        buyerName,
        expiresAt: card.expires_at as string,
      }).catch((e) =>
        console.warn("[gift-card/confirm] recipient email failed", e)
      );
    }

    if (buyerEmail) {
      void sendGiftCardBuyerEmail({
        tenantId: card.tenant_id as string,
        recipientName: card.recipient_name as string,
        amountPence: card.initial_pence as number,
        buyerEmail,
        buyerClientId: card.purchased_by as string | null,
      }).catch((e) =>
        console.warn("[gift-card/confirm] buyer email failed", e)
      );
    }
  }

  return NextResponse.redirect(`${url.origin}/portal/shop?giftSent=1`);
}
