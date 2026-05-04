"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/booking-queries";
import {
  generateShortCode,
  tierDisplayLabel,
  tierQualifies,
} from "@/lib/loyalty/utils";
import { sendWebPushToClient } from "@/lib/comms/sendWebPushToClient";
import type { LoyaltyTier } from "@/lib/utils";

// =====================================================
// redeemReward — used for non-gift_friend_session kinds
// =====================================================
//
// Branching:
//   - discount_pence / percent_off  → insert redemption (fulfilled) +
//     ledger debit + generate voucher_code; return code to dialog.
//   - free_service                  → insert redemption (fulfilled) +
//     ledger debit; return service_id so the caller can route to
//     /portal/book?reward=<redemption_id>.
//   - experience                    → insert redemption (pending) +
//     ledger debit + bot chat message asking Nigel to reach out.
//   - gift_friend_session           → NOT handled here. The dialog
//     opens the gift form, which calls giftFriendTrial directly
//     (single source of truth for the 4 000-pt debit, reason=
//     'gifted_to_friend' per the ledger reason allow-list).
//   - gift_card                     → not implemented (no seeded
//     rewards of this kind in V1).
//
// The action uses the admin client because:
//   - Inserts into loyalty_ledger require ledger_staff or service_role.
//     The ledger_self policy is SELECT-only.
//   - We need atomic insert + rollback on partial failure.

export type RedeemResult =
  | { ok: true; kind: "voucher"; redemptionId: string; voucherCode: string; newBalance: number }
  | { ok: true; kind: "free_service"; redemptionId: string; serviceId: string | null; newBalance: number }
  | { ok: true; kind: "experience"; redemptionId: string; newBalance: number }
  | { ok: true; kind: "gift_friend_open_form"; rewardCostPoints: number; newBalance: number }
  | { ok: false; error: string };

export async function redeemReward(rewardId: string): Promise<RedeemResult> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "no session" };
  }
  const { clientId, tenantId } = portal;
  const admin = createAdminSupabase();

  const [{ data: reward }, { data: account }] = await Promise.all([
    admin
      .from("loyalty_rewards")
      .select(
        "id, slug, name, kind, cost_points, value_pence, percent_value, service_id, min_tier, is_active, tenant_id"
      )
      .eq("id", rewardId)
      .maybeSingle(),
    admin
      .from("loyalty_accounts")
      .select("current_points, tier")
      .eq("client_id", clientId)
      .maybeSingle(),
  ]);

  if (!reward || !reward.is_active) {
    return { ok: false, error: "Reward not available" };
  }
  if (reward.tenant_id !== tenantId) {
    return { ok: false, error: "Reward not in your tenant" };
  }

  const currentPoints = (account?.current_points as number | undefined) ?? 0;
  const clientTier = (account?.tier as LoyaltyTier | undefined) ?? "friend";

  // For gift_friend_session, we do NOT debit points here. Tell the caller
  // to open the gift form; submission goes through giftFriendTrial.
  if (reward.kind === "gift_friend_session") {
    if (currentPoints < reward.cost_points) {
      return {
        ok: false,
        error: `Need ${reward.cost_points - currentPoints} more pts`,
      };
    }
    if (!tierQualifies(clientTier, reward.min_tier as LoyaltyTier)) {
      return {
        ok: false,
        error: `${tierDisplayLabel(reward.min_tier as LoyaltyTier)} tier required`,
      };
    }
    return {
      ok: true,
      kind: "gift_friend_open_form",
      rewardCostPoints: reward.cost_points,
      newBalance: currentPoints, // unchanged at this stage
    };
  }

  if (reward.kind === "gift_card") {
    return { ok: false, error: "Gift cards aren't available yet" };
  }

  if (currentPoints < reward.cost_points) {
    return {
      ok: false,
      error: `Need ${reward.cost_points - currentPoints} more pts`,
    };
  }
  if (!tierQualifies(clientTier, reward.min_tier as LoyaltyTier)) {
    return {
      ok: false,
      error: `${tierDisplayLabel(reward.min_tier as LoyaltyTier)} tier required`,
    };
  }

  // Pending only for experience (Sculpt Day) — staff confirms it manually.
  // Everything else fulfils immediately so the client has the voucher /
  // free-service ticket in their account right away.
  const initialStatus = reward.kind === "experience" ? "pending" : "fulfilled";
  const voucherCode =
    reward.kind === "discount_pence" || reward.kind === "percent_off"
      ? generateShortCode(8)
      : null;
  const fulfilledAt =
    initialStatus === "fulfilled" ? new Date().toISOString() : null;

  const { data: redemption, error: redempError } = await admin
    .from("loyalty_redemptions")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      reward_id: rewardId,
      points_spent: reward.cost_points,
      status: initialStatus,
      voucher_code: voucherCode,
      fulfilled_at: fulfilledAt,
    })
    .select("id")
    .single();

  if (redempError || !redemption) {
    console.error("[redeemReward] redemption insert failed", redempError);
    return { ok: false, error: "Couldn't save redemption" };
  }

  const { error: ledgerError } = await admin.from("loyalty_ledger").insert({
    tenant_id: tenantId,
    client_id: clientId,
    delta_points: -reward.cost_points,
    reason: "redemption",
    redemption_id: redemption.id,
    display_label: `Redeemed: ${reward.name}`,
  });

  if (ledgerError) {
    // Roll back to keep the books consistent.
    await admin.from("loyalty_redemptions").delete().eq("id", redemption.id);
    console.error("[redeemReward] ledger insert failed", ledgerError);
    return { ok: false, error: "Couldn't debit your balance" };
  }

  // Side-effects per kind.
  if (reward.kind === "experience") {
    await insertSculptDayBotMessage(clientId, tenantId);
  }

  // gift_card emails would dispatch here once the kind is enabled.
  // TODO(prompt-7+): once a gift_card reward is seeded, send the
  // recipient email via Resend. RESEND_API_KEY isn't set yet in V1.

  revalidatePath("/portal/me");
  revalidatePath("/portal");

  const newBalance = currentPoints - reward.cost_points;

  if (reward.kind === "free_service") {
    return {
      ok: true,
      kind: "free_service",
      redemptionId: redemption.id as string,
      serviceId: (reward.service_id as string | null) ?? null,
      newBalance,
    };
  }
  if (reward.kind === "experience") {
    return { ok: true, kind: "experience", redemptionId: redemption.id as string, newBalance };
  }
  // discount_pence / percent_off
  return {
    ok: true,
    kind: "voucher",
    redemptionId: redemption.id as string,
    voucherCode: voucherCode!,
    newBalance,
  };
}

async function insertSculptDayBotMessage(
  clientId: string,
  tenantId: string
): Promise<void> {
  const admin = createAdminSupabase();
  // Find or create the in_app thread (mirrors getOrCreateClientThread
  // but inlined here to keep the redeem path self-contained).
  const { data: existing } = await admin
    .from("chat_threads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("channel", "in_app")
    .maybeSingle();

  let threadId: string;
  if (existing) {
    threadId = existing.id as string;
  } else {
    const { data: created, error } = await admin
      .from("chat_threads")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        channel: "in_app",
        status: "open",
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[redeemReward/experience] thread create failed", error);
      return;
    }
    threadId = created.id as string;
  }

  const sculptBody =
    "Sculpt Day requested ✨ Nigel will reach out within 24 hours to schedule.";
  await admin.from("chat_messages").insert({
    tenant_id: tenantId,
    thread_id: threadId,
    sender_client_id: null,
    sender_staff_id: null,
    author_type: "bot",
    body: sculptBody,
    primary_channel: "in_app_push",
  });
  // Best-effort push so the client sees the bot's confirmation even if
  // they navigate away from /portal/me before opening /portal/chat.
  void sendWebPushToClient(clientId, {
    title: "Astrabody",
    body: sculptBody.length > 80 ? sculptBody.slice(0, 79) + "…" : sculptBody,
    url: "/portal/chat",
    tag: `chat-${threadId}`,
  });
}

// =====================================================
// giftFriendTrial — the gift-a-friend action
// =====================================================
//
// Used by:
//   - the inline GiftFriendPanel (visible when balance >= 4 000)
//   - the RedeemDialog gift-form mode (when redeemReward returns
//     kind="gift_friend_open_form")
//
// Inserts a referral row, debits 4 000 pts via a ledger entry with
// reason='gifted_to_friend', and stubs the WhatsApp template send.

export interface GiftFriendInput {
  friendName: string;
  friendPhone: string;
  friendEmail?: string;
  message?: string;
}

export type GiftFriendResult =
  | { ok: true; inviteCode: string; newBalance: number }
  | { ok: false; error: string };

export async function giftFriendTrial(
  input: GiftFriendInput
): Promise<GiftFriendResult> {
  const friendName = input.friendName.trim();
  const friendPhone = input.friendPhone.trim();
  const friendEmail = input.friendEmail?.trim() || null;
  const message = input.message?.trim().slice(0, 200) || null;

  if (!friendName) return { ok: false, error: "Add a name." };
  if (!/^\+?[\d\s().-]{8,}$/.test(friendPhone)) {
    return { ok: false, error: "Phone number doesn't look right." };
  }

  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "no session" };
  }
  const { clientId, tenantId } = portal;
  const admin = createAdminSupabase();

  // Look up the canonical gift-friend reward to read its cost_points
  // (single source of truth — never hardcode).
  const { data: reward } = await admin
    .from("loyalty_rewards")
    .select("cost_points")
    .eq("tenant_id", tenantId)
    .eq("slug", "gift-friend-trial")
    .maybeSingle();
  const costPoints = (reward?.cost_points as number | undefined) ?? 4000;

  // Refuse self-gift by phone match.
  const { data: meClient } = await admin
    .from("clients")
    .select("phone")
    .eq("id", clientId)
    .maybeSingle();
  if (meClient?.phone && normalisePhone(meClient.phone) === normalisePhone(friendPhone)) {
    return { ok: false, error: "That's your own number." };
  }

  // Re-check balance.
  const { data: account } = await admin
    .from("loyalty_accounts")
    .select("current_points")
    .eq("client_id", clientId)
    .maybeSingle();
  const currentPoints = (account?.current_points as number | undefined) ?? 0;
  if (currentPoints < costPoints) {
    return {
      ok: false,
      error: `Need ${costPoints - currentPoints} more pts.`,
    };
  }

  // Ensure invite_code is unique within tenant. Retry up to 4 times on collision.
  let inviteCode = generateShortCode(8);
  let referralId: string | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin
      .from("loyalty_referrals")
      .insert({
        tenant_id: tenantId,
        referrer_client_id: clientId,
        invite_code: inviteCode,
        invite_channel: "whatsapp",
        invited_phone: friendPhone,
        invited_email: friendEmail,
        status: "invited",
        expires_at: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .select("id")
      .single();
    if (!error && data) {
      referralId = data.id as string;
      break;
    }
    if (error?.code === "23505") {
      inviteCode = generateShortCode(8);
      continue;
    }
    console.error("[giftFriendTrial] referral insert failed", error);
    return { ok: false, error: "Couldn't save the gift." };
  }
  if (!referralId) {
    return { ok: false, error: "Couldn't generate a unique invite code." };
  }

  // Ledger debit, reason='gifted_to_friend' per allow-list.
  const { error: ledgerError } = await admin.from("loyalty_ledger").insert({
    tenant_id: tenantId,
    client_id: clientId,
    delta_points: -costPoints,
    reason: "gifted_to_friend",
    referral_id: referralId,
    display_label: `Gifted a trial to ${friendName}`,
  });
  if (ledgerError) {
    await admin.from("loyalty_referrals").delete().eq("id", referralId);
    console.error("[giftFriendTrial] ledger insert failed", ledgerError);
    return { ok: false, error: "Couldn't debit your balance." };
  }

  // Send the gift via WhatsApp template (stubbed).
  // TODO: when bot/send-template endpoint is exposed, replace the stub
  // with a real send. Template variables would be { friend_name,
  // referrer_first_name, invite_code, message? }.
  const { sendWhatsAppTemplate } = await import("@/lib/comms/sendWhatsAppTemplate");
  await sendWhatsAppTemplate({
    toPhone: friendPhone,
    templateName: "astrabody_friend_trial_gift",
    variables: {
      friend_name: friendName,
      invite_code: inviteCode,
      message: message ?? "",
    },
  });

  revalidatePath("/portal/me");
  revalidatePath("/portal");

  return {
    ok: true,
    inviteCode,
    newBalance: currentPoints - costPoints,
  };
}

function normalisePhone(s: string): string {
  return s.replace(/[\s().-]/g, "");
}

// =====================================================
// updateClientProfile — settings section
// =====================================================
//
// Uses the user-scoped client (clients_self RLS policy allows the
// portal client to update their own clients row).

export interface UpdateProfileInput {
  full_name?: string;
  marketing_opt_in?: boolean;
  birth_date?: string | null;
}

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateClientProfile(
  input: UpdateProfileInput
): Promise<UpdateProfileResult> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "no session" };
  }
  const supabase = await createServerSupabase();
  const update: Record<string, unknown> = {};
  if (typeof input.full_name === "string") {
    update.full_name = input.full_name.trim() || null;
  }
  if (typeof input.marketing_opt_in === "boolean") {
    update.marketing_opt_in = input.marketing_opt_in;
  }
  if (input.birth_date !== undefined) {
    // Empty string clears the date.
    update.birth_date = input.birth_date && input.birth_date.length > 0
      ? input.birth_date
      : null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("clients")
    .update(update)
    .eq("id", portal.clientId);
  if (error) {
    console.error("[updateClientProfile] failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/portal");
  revalidatePath("/portal/me");
  return { ok: true };
}
