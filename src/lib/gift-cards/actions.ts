"use server";

import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";
import { getPortalContext } from "@/lib/portal/booking-queries";
import { generateGiftCardCode } from "./queries";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const MIN_PENCE = 2000; // £20
const MAX_PENCE = 50000; // £500
const ALLOWED_PRESETS = [3900, 8000, 16000];

interface PurchaseInput {
  amountPence: number;
  recipientName: string;
  recipientEmail: string;
  personalMessage?: string | null;
}

/**
 * Buy a gift card. Creates a PENDING gift_cards row (balance=0) plus a
 * Stripe PaymentIntent and returns its client_secret. The redirect
 * handler at /api/gift-cards/[id]/confirm verifies the PI on success
 * and activates the card (balance_pence=initial_pence + email).
 */
export async function purchaseGiftCard(
  input: PurchaseInput
): Promise<Result<{ giftCardId: string; clientSecret: string }>> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "Sign in to send a gift." };
  }

  const amount = Math.round(input.amountPence);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: "Invalid amount." };
  }
  if (amount < MIN_PENCE || amount > MAX_PENCE) {
    return {
      ok: false,
      error: `Amount must be between £${MIN_PENCE / 100} and £${MAX_PENCE / 100}.`,
    };
  }
  // Allow presets exactly, otherwise insist on whole pounds (no
  // dust-amount custom values).
  if (!ALLOWED_PRESETS.includes(amount) && amount % 100 !== 0) {
    return { ok: false, error: "Custom amounts must be whole pounds." };
  }

  const recipientName = input.recipientName.trim();
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!recipientName) return { ok: false, error: "Recipient name required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return { ok: false, error: "Recipient email looks wrong." };
  }
  const message = (input.personalMessage ?? "").trim().slice(0, 200) || null;

  const admin = createAdminSupabase();
  const code = generateGiftCardCode();

  const { data: row, error: insertError } = await admin
    .from("gift_cards")
    .insert({
      tenant_id: portal.tenantId,
      code,
      initial_pence: amount,
      balance_pence: 0, // activated on PI succeeded
      purchased_by: portal.clientId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      personal_message: message,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    return {
      ok: false,
      error: insertError?.message ?? "Couldn't queue the gift card.",
    };
  }
  const giftCardId = row.id as string;

  try {
    const intent = await stripe().paymentIntents.create({
      amount,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      description: `Gift card · Astrabody`,
      metadata: {
        astrabody_kind: "gift_card",
        astrabody_gift_card_id: giftCardId,
        astrabody_tenant_id: portal.tenantId,
      },
    });
    if (!intent.client_secret) throw new Error("no client_secret");
    await admin
      .from("gift_cards")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", giftCardId);
    return { ok: true, giftCardId, clientSecret: intent.client_secret };
  } catch (err) {
    // Roll back the pending row so it doesn't show up as orphaned in
    // the admin tab. Cheap — just one delete.
    await admin.from("gift_cards").delete().eq("id", giftCardId);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe setup failed",
    };
  }
}

// -------------------------------------------------------------
// ADMIN ACTIONS
// -------------------------------------------------------------

interface ManualGiftCardInput {
  amountPence: number;
  recipientName: string;
  recipientEmail: string;
  personalMessage?: string | null;
}

/**
 * Owner can mint a card without payment (compensation / goodwill).
 * Creates the card already activated (balance = initial_pence) and
 * sends the recipient email immediately.
 */
export async function issueManualGiftCard(
  input: ManualGiftCardInput
): Promise<Result<{ giftCardId: string }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can issue gift cards." };
  }

  const amount = Math.round(input.amountPence);
  if (!Number.isFinite(amount) || amount < 100 || amount > 100_000_00) {
    return { ok: false, error: "Amount looks wrong." };
  }
  const recipientName = input.recipientName.trim();
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!recipientName) return { ok: false, error: "Recipient name required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return { ok: false, error: "Recipient email looks wrong." };
  }
  const message = (input.personalMessage ?? "").trim().slice(0, 200) || null;

  const admin = createAdminSupabase();
  const code = generateGiftCardCode();
  const { data: row, error } = await admin
    .from("gift_cards")
    .insert({
      tenant_id: ctx.tenantId,
      code,
      initial_pence: amount,
      balance_pence: amount,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      personal_message: message,
    })
    .select("id, code, expires_at")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Couldn't issue." };
  }

  // Lazy-import the email sender to keep this server action lean.
  const { sendGiftCardRecipientEmail } = await import("./email");
  void sendGiftCardRecipientEmail({
    tenantId: ctx.tenantId,
    giftCardId: row.id as string,
    code: row.code as string,
    amountPence: amount,
    recipientName,
    recipientEmail,
    personalMessage: message,
    buyerName: "the team",
    expiresAt: row.expires_at as string,
  }).catch((e) => console.warn("[gift-card] manual email failed", e));

  revalidatePath("/admin/settings");
  return { ok: true, giftCardId: row.id as string };
}

/**
 * Validate a code from the booking checkout. Tenant-scoped. Returns
 * the balance and expiry so the client can preview the discount inline.
 */
export async function validateGiftCard(
  rawCode: string
): Promise<
  | { ok: true; balancePence: number; expiresAt: string }
  | { ok: false; error: string }
> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "Sign in to use a gift card." };
  }
  const { lookupActiveGiftCard } = await import("./queries");
  const lookup = await lookupActiveGiftCard(portal.tenantId, rawCode);
  if (!lookup.ok) {
    return {
      ok: false,
      error:
        lookup.reason === "expired"
          ? "That gift card has expired."
          : lookup.reason === "voided"
            ? "That gift card has been voided."
            : lookup.reason === "empty"
              ? "That gift card has no balance left."
              : "Gift card not found.",
    };
  }
  return {
    ok: true,
    balancePence: lookup.card.balance_pence,
    expiresAt: lookup.card.expires_at,
  };
}

/** Void an active gift card. Owner only. Sets balance to 0. */
export async function voidGiftCard(
  giftCardId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can void gift cards." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("gift_cards")
    .update({
      balance_pence: 0,
      voided_at: new Date().toISOString(),
      voided_by_user_id: ctx.userId,
    })
    .eq("id", giftCardId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}
