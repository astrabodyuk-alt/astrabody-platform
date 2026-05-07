"use server";

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomerId } from "@/lib/stripe/customers";
import {
  getServiceDetail,
  getDefaultStaffForService,
  getPortalContext,
} from "@/lib/portal/booking-queries";
import { combinePrice } from "@/lib/loyalty/price-combiner";
import { checkSlotAgainstBlocks } from "@/lib/scheduling/holidays";
import { claimReferralOnFirstBooking } from "@/lib/referrals/actions";
import { ensureIntakeResponseForBooking } from "@/lib/forms/actions";
import { validateFlashSlot, claimFlashSlot } from "@/lib/flash-slots/queries";

interface CreateInput {
  serviceId: string;
  /** ISO datetime — must come from a slot returned by /api/availability. */
  startsAtIso: string;
  /** Set when the booking is being made against a redeemed free_service reward. */
  redemptionId?: string | null;
  /**
   * Practitioner choice from the booking flow. null / undefined = "any" →
   * fall back to the default staff (first staff_services row by sort_order).
   * If set, validated server-side against staff_services so a client
   * can't bind a booking to a staff member who doesn't perform the service.
   */
  staffId?: string | null;
  /**
   * Voucher ids the client wants to apply. Server filters to:
   *   - status = 'active'
   *   - expires_at > now()
   *   - client_id matches the current portal client
   * Vouchers that fail validation are silently dropped (defensive — the
   * caller may pass a stale list).
   */
  applyVoucherIds?: string[] | null;
  /** Points to apply. Capped server-side at the client's current balance. */
  applyPoints?: number | null;
  /**
   * If set, consume one session from this client_packages row instead
   * of charging. Server validates: belongs to client, status='active',
   * service matches, sessions_remaining > 0, expires_at > now().
   * Skips Stripe entirely; the booking lands as confirmed at price 0.
   */
  useClientPackageId?: string | null;
  /**
   * Save the card used for this checkout for future off-session charges
   * (no-show fee, late cancel, one-tap pack purchase). Only ever true
   * when the client explicitly ticked the consent checkbox at checkout.
   * Forwards to Stripe as `setup_future_usage='off_session'`.
   */
  saveCard?: boolean;
  /**
   * When true, the PaymentIntent is bound to the client's existing
   * default Stripe payment method — used by the "Pay with •• 4242"
   * express checkout path. Stripe surfaces SCA inline if required.
   */
  useSavedCard?: boolean;
  /**
   * Resource scope for services that have multiple physical units:
   *   - <uuid>  → bind the booking to that specific resource (validated)
   *   - "any"   → atomically pick the first free resource at the slot
   *   - omitted → no resource (services without resources)
   */
  resourceId?: string | "any" | null;
  /**
   * Gift-card code to redeem against this booking. Applied after
   * vouchers / points; partial redemption is supported (the residual
   * stays on the card for next time). Invalid codes return an error
   * rather than silently falling through.
   */
  giftCardCode?: string | null;
  /**
   * Flash slot id. When provided, server validates the deal is still
   * active + not expired + not fully claimed, then overrides pricePence
   * and depositPence with flash_price_pence.
   */
  flashSlotId?: string | null;
}

export type CreateBookingResult =
  | {
      ok: true;
      bookingId: string;
      /** Free booking — already confirmed, skip Stripe and route to /confirmed. */
      free: true;
    }
  | {
      ok: true;
      bookingId: string;
      free: false;
      clientSecret: string;
    }
  | { ok: false; error: string };

/**
 * Create a booking row + Stripe PaymentIntent (or skip Stripe if free).
 *
 * Branching:
 *   - deposit_pence > 0  → charge deposit_pence via Stripe.
 *   - deposit_pence = 0 and price_pence > 0  → charge price_pence in full.
 *   - both 0  → free booking, no Stripe call, status = confirmed immediately.
 *
 * Uses the admin client because portal clients can't INSERT into bookings
 * under the existing RLS (clients_self covers their clients row only;
 * bookings_client_self is SELECT only). Server-only by "use server".
 *
 * TODO(multi-tenant): when we resell to other tenants, swap to Stripe
 * Connect destination charges so deposits land in the tenant's account.
 */
export async function createBookingAndIntent(
  input: CreateInput
): Promise<CreateBookingResult> {
  const { serviceId, startsAtIso } = input;

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "invalid start time" };
  }
  if (startsAt.getTime() <= Date.now()) {
    return { ok: false, error: "start time must be in the future" };
  }

  let portalContext;
  try {
    portalContext = await getPortalContext();
  } catch {
    return { ok: false, error: "no session" };
  }
  const { clientId, tenantId } = portalContext;

  const service = await getServiceDetail(serviceId);
  if (!service || service.tenant_id !== tenantId) {
    return { ok: false, error: "service not found" };
  }

  // Resolve practitioner. Specific staffId takes priority; fall back to
  // default. Validate the chosen staff actually performs this service.
  let staff: { id: string; display_name: string; email: string | null } | null = null;
  if (input.staffId) {
    const adminTmp = createAdminSupabase();
    const { data: link } = await adminTmp
      .from("staff_services")
      .select("staff:staff_id (id, display_name, email, is_active, tenant_id)")
      .eq("service_id", serviceId)
      .eq("staff_id", input.staffId)
      .maybeSingle();
    type Embed = {
      staff:
        | {
            id: string;
            display_name: string;
            email: string | null;
            is_active: boolean;
            tenant_id: string;
          }
        | Array<{
            id: string;
            display_name: string;
            email: string | null;
            is_active: boolean;
            tenant_id: string;
          }>
        | null;
    };
    const embed = link as Embed | null;
    const row = embed
      ? Array.isArray(embed.staff)
        ? embed.staff[0]
        : embed.staff
      : null;
    if (row && row.is_active && row.tenant_id === tenantId) {
      staff = { id: row.id, display_name: row.display_name, email: row.email };
    }
  }
  if (!staff) {
    staff = await getDefaultStaffForService(serviceId);
  }
  if (!staff) {
    return { ok: false, error: "no staff for service" };
  }

  const endsAt = new Date(
    startsAt.getTime() +
      (service.duration_min + service.buffer_min) * 60_000
  );

  const admin = createAdminSupabase();

  // Race-condition guard against a closure or staff time-off added
  // after the slot was offered. The resolver already filtered these
  // out, but a window between freebusy fetch and insert can drift.
  const blockReason = await checkSlotAgainstBlocks(admin, {
    tenantId,
    staffId: staff.id,
    serviceId,
    startsAtMs: startsAt.getTime(),
    endsAtMs: endsAt.getTime(),
    tz: "Europe/London",
  });
  if (blockReason) {
    return { ok: false, error: blockReason };
  }

  // If a redemption was passed, validate it server-side and override
  // price/deposit. Defence in depth: the page already validated this,
  // but the server action is the canonical source of truth.
  let pricePence = service.price_pence;
  let depositPence = service.deposit_pence;
  let validRedemptionId: string | null = null;
  if (input.redemptionId) {
    const { data: redemption } = await admin
      .from("loyalty_redemptions")
      .select(
        "id, client_id, booking_id, loyalty_rewards:reward_id (kind, service_id)"
      )
      .eq("id", input.redemptionId)
      .maybeSingle();
    if (!redemption || redemption.client_id !== clientId) {
      return { ok: false, error: "Redemption not found" };
    }
    if (redemption.booking_id) {
      return { ok: false, error: "Redemption already used" };
    }
    type RewardSlim = { kind: string; service_id: string | null };
    const rewardEmbed = (redemption as { loyalty_rewards: unknown }).loyalty_rewards;
    const reward = (Array.isArray(rewardEmbed) ? rewardEmbed[0] : rewardEmbed) as RewardSlim | null;
    if (!reward || reward.kind !== "free_service" || reward.service_id !== serviceId) {
      return { ok: false, error: "Redemption doesn't match this service" };
    }
    pricePence = 0;
    depositPence = 0;
    validRedemptionId = redemption.id as string;
  }

  // Pack consumption — fully short-circuits Stripe + wallet stacking.
  // A pack-backed booking is just N sessions on a credit balance; we
  // don't combine it with vouchers / points / redemptions because the
  // client already paid for those sessions in pence at purchase time.
  let consumedPackId: string | null = null;
  if (input.useClientPackageId) {
    if (validRedemptionId) {
      return {
        ok: false,
        error: "Can't combine a pack with a free-session reward.",
      };
    }
    const { data: pack } = await admin
      .from("client_packages")
      .select(
        "id, client_id, service_id, sessions_remaining, status, expires_at"
      )
      .eq("id", input.useClientPackageId)
      .maybeSingle();
    if (!pack || pack.client_id !== clientId) {
      return { ok: false, error: "pack not found" };
    }
    if (pack.service_id !== serviceId) {
      return {
        ok: false,
        error: "this pack is not valid for the selected service",
      };
    }
    if (pack.status !== "active") {
      return { ok: false, error: "pack is not active" };
    }
    if ((pack.sessions_remaining as number) <= 0) {
      return { ok: false, error: "no sessions remaining on this pack" };
    }
    if (new Date(pack.expires_at as string).getTime() <= Date.now()) {
      return { ok: false, error: "pack has expired" };
    }
    pricePence = 0;
    depositPence = 0;
    consumedPackId = pack.id as string;
  }

  // Flash slot — validates and overrides price (cannot stack with packs/redemptions).
  let validatedFlashSlotId: string | null = null;
  if (input.flashSlotId && !validRedemptionId && !consumedPackId) {
    const flashResult = await validateFlashSlot(input.flashSlotId, serviceId, tenantId);
    if (!flashResult.valid) {
      return { ok: false, error: flashResult.reason };
    }
    pricePence = flashResult.flashPricePence;
    depositPence = 0; // Flash deals are charged in full, no deposit split
    validatedFlashSlotId = input.flashSlotId;
  }

  const baseAmount = depositPence > 0 ? depositPence : pricePence;

  // Run the price combiner against the wallet snapshot (vouchers + points).
  // Skipped entirely when a free_service redemption from /portal/me already
  // overrode price/deposit — the redemption path doesn't stack with vouchers.
  let appliedVoucherIds: string[] = [];
  let pointsApplied = 0;
  let amount = baseAmount;
  if (!validRedemptionId && !consumedPackId && (input.applyVoucherIds?.length || (input.applyPoints ?? 0) > 0)) {
    const requestedIds = (input.applyVoucherIds ?? []).filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );

    let validatedVouchers: Array<{
      id: string;
      kind: "percent" | "amount" | "free_service";
      valuePct: number | null;
      valuePence: number | null;
      serviceId: string | null;
    }> = [];
    if (requestedIds.length > 0) {
      const { data: rows } = await admin
        .from("loyalty_vouchers")
        .select("id, kind, value_pct, value_pence, service_id, status, expires_at, client_id, tenant_id")
        .in("id", requestedIds)
        .eq("client_id", clientId)
        .eq("tenant_id", tenantId)
        .eq("status", "active");
      const nowIso = new Date().toISOString();
      validatedVouchers = ((rows ?? []) as Array<{
        id: string;
        kind: "percent" | "amount" | "free_service";
        value_pct: number | null;
        value_pence: number | null;
        service_id: string | null;
        status: string;
        expires_at: string;
      }>)
        .filter((r) => r.expires_at > nowIso)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          valuePct: r.value_pct,
          valuePence: r.value_pence,
          serviceId: r.service_id,
        }));
    }

    // Cap requested points at the client's current balance.
    const { data: account } = await admin
      .from("loyalty_accounts")
      .select("current_points")
      .eq("client_id", clientId)
      .maybeSingle();
    const currentPoints = (account?.current_points as number | undefined) ?? 0;
    const requestedPoints = Math.max(0, input.applyPoints ?? 0);
    const cappedPoints = Math.min(requestedPoints, currentPoints);

    const result = combinePrice({
      basePence: baseAmount,
      serviceId,
      vouchers: validatedVouchers,
      pointsToApply: cappedPoints,
    });
    amount = result.finalPence;
    appliedVoucherIds = result.appliedVoucherIds;
    pointsApplied = result.pointsApplied;
  }

  // Gift-card redemption — applied after vouchers / points so it eats
  // whatever residual is left. Partial redemption supported: if the
  // card is bigger than the residual, the rest stays on the card.
  let giftCardId: string | null = null;
  let giftCardAppliedPence = 0;
  if (input.giftCardCode && input.giftCardCode.trim() !== "") {
    const { lookupActiveGiftCard } = await import(
      "@/lib/gift-cards/queries"
    );
    const lookup = await lookupActiveGiftCard(tenantId, input.giftCardCode);
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
    giftCardAppliedPence = Math.min(lookup.card.balance_pence, amount);
    if (giftCardAppliedPence > 0) {
      amount = amount - giftCardAppliedPence;
      giftCardId = lookup.card.id;
    }
  }

  const isFree = amount === 0;

  // Resource resolution. When the service has resources we always need
  // a concrete resource_id on the booking row, even if the client passed
  // "any". To prevent a race between two simultaneous "any" bookings
  // colliding on the same physical unit, we pick the first free resource
  // here using the same overlap query, just before inserting. This
  // isn't a true SERIALIZABLE transaction — but two writes hitting the
  // same resource in the same instant are caught by the bookings_resource
  // partial index + unique-style scan; if the second one detects an
  // overlap it falls through to "no free resource" and rolls back.
  let resolvedResourceId: string | null = null;
  {
    const { data: resources } = await admin
      .from("service_resources")
      .select("id")
      .eq("service_id", serviceId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const allIds = ((resources ?? []) as Array<{ id: string }>).map(
      (r) => r.id
    );
    if (allIds.length > 0) {
      const reqId = input.resourceId;
      if (reqId && reqId !== "any") {
        if (!allIds.includes(reqId)) {
          return { ok: false, error: "resource not found for this service" };
        }
        // Validate that this resource is free at the requested slot.
        const { data: collide } = await admin
          .from("bookings")
          .select("id")
          .eq("resource_id", reqId)
          .in("status", ["pending", "confirmed"])
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString())
          .limit(1);
        if ((collide ?? []).length > 0) {
          return { ok: false, error: "that unit just got taken — pick another time" };
        }
        resolvedResourceId = reqId;
      } else {
        // "any" — pick the first free resource by sort_order.
        const { data: collisions } = await admin
          .from("bookings")
          .select("resource_id")
          .in("resource_id", allIds)
          .in("status", ["pending", "confirmed"])
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString());
        const taken = new Set(
          ((collisions ?? []) as Array<{ resource_id: string | null }>)
            .map((r) => r.resource_id)
            .filter((v): v is string => !!v)
        );
        const free = allIds.find((id) => !taken.has(id));
        if (!free) {
          return { ok: false, error: "no equipment free at that time" };
        }
        resolvedResourceId = free;
      }
    }
  }

  const { data: booking, error: insertError } = await admin
    .from("bookings")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      staff_id: staff.id,
      service_id: serviceId,
      resource_id: resolvedResourceId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: isFree ? "confirmed" : "pending",
      price_pence: pricePence,
      deposit_pence: depositPence,
      // For a redemption-backed free booking the "payment" is the points
      // already debited on /portal/me, so deposit_paid=true per spec.
      // Same true when the wallet combiner zeroed the bill via vouchers.
      deposit_paid: validRedemptionId != null || isFree,
      source: "web",
      applied_voucher_ids: appliedVoucherIds,
      points_spent: pointsApplied,
      client_package_id: consumedPackId,
      card_on_file_consent: input.saveCard === true,
    })
    .select("id")
    .single();

  if (insertError || !booking) {
    console.error("[createBookingAndIntent] insert failed", insertError);
    return { ok: false, error: "couldn't create booking" };
  }

  if (validRedemptionId) {
    // Bind the redemption to the booking so it can't be reused.
    await admin
      .from("loyalty_redemptions")
      .update({ booking_id: booking.id as string })
      .eq("id", validRedemptionId);
  }

  // Mark vouchers redeemed and debit points.
  // Voucher.redemption_id stays null in V1 because loyalty_redemptions
  // requires reward_id (NOT NULL) and vouchers don't have one. The
  // booking row is the audit trail (applied_voucher_ids[]).
  if (appliedVoucherIds.length > 0) {
    await admin
      .from("loyalty_vouchers")
      .update({ status: "redeemed" })
      .in("id", appliedVoucherIds)
      .eq("client_id", clientId);
  }
  if (pointsApplied > 0) {
    await admin.from("loyalty_ledger").insert({
      tenant_id: tenantId,
      client_id: clientId,
      delta_points: -pointsApplied,
      reason: "redemption",
      booking_id: booking.id as string,
      display_label: `Spent on ${service.name}`,
    });
  }

  // Claim the flash slot (increment claims_count, auto-set fully_claimed).
  if (validatedFlashSlotId) {
    await claimFlashSlot(validatedFlashSlotId).catch((e) =>
      console.warn("[flash] claimFlashSlot failed", e)
    );
  }

  // Claim a pending referral cookie if this is the client's first
  // booking. Cheap to call always — the function no-ops when the
  // cookie is missing, the programme is disabled, or this client has
  // already been claimed.
  await claimReferralOnFirstBooking({
    tenantId,
    referredClientId: clientId,
    bookingPricePence: pricePence,
  }).catch((e) => console.warn("[referral] claim failed", e));

  // Mint an intake_responses row when the service has an active
  // form attached. The 24h cron sends the WhatsApp + email; admin
  // can also resend manually from the booking drawer.
  void ensureIntakeResponseForBooking({
    tenantId,
    bookingId: booking.id as string,
    serviceId,
    clientId,
    startsAtIso: startsAt.toISOString(),
  }).catch((e) => console.warn("[intake] ensure failed", e));

  // Debit the gift card now that the booking has been inserted.
  if (giftCardId && giftCardAppliedPence > 0) {
    const { data: cardBefore } = await admin
      .from("gift_cards")
      .select("balance_pence")
      .eq("id", giftCardId)
      .maybeSingle();
    const newBalance = Math.max(
      0,
      ((cardBefore?.balance_pence as number | undefined) ?? 0) -
        giftCardAppliedPence
    );
    await admin
      .from("gift_cards")
      .update({
        balance_pence: newBalance,
        redeemed_by: newBalance === 0 ? clientId : null,
        redeemed_at: newBalance === 0 ? new Date().toISOString() : null,
      })
      .eq("id", giftCardId);
  }

  if (isFree) {
    return { ok: true, bookingId: booking.id as string, free: true };
  }

  // TODO(multi-tenant): swap to Stripe Connect destination charges.
  // Save-card + saved-card flow:
  //   - When the client ticked "save my card", we always need a Stripe
  //     Customer (so Stripe attaches the PM after payment).
  //   - When the client tapped "use my saved card", we attach the
  //     stored payment_method to the intent so the client's confirm
  //     call doesn't need to collect card details again.
  let stripeCustomerId: string | null = null;
  let savedPaymentMethodId: string | null = null;
  if (input.saveCard || input.useSavedCard) {
    const r = await getOrCreateStripeCustomerId({
      clientId,
      tenantId,
    });
    if (r.ok) stripeCustomerId = r.customerId;
  }
  if (input.useSavedCard) {
    const { data: row } = await admin
      .from("clients")
      .select("default_payment_method_id, stripe_customer_id")
      .eq("id", clientId)
      .maybeSingle();
    const pm = (row?.default_payment_method_id as string | null) ?? null;
    const cust = (row?.stripe_customer_id as string | null) ?? null;
    if (pm && cust) {
      savedPaymentMethodId = pm;
      stripeCustomerId = cust;
    } else {
      // Fall back gracefully — render the full payment element instead.
      savedPaymentMethodId = null;
    }
  }

  try {
    const params: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: "gbp",
      metadata: {
        booking_id: booking.id as string,
        save_card: input.saveCard ? "yes" : "no",
      },
      description: `${service.name} — Astrabody booking ${booking.id}`,
    };
    if (stripeCustomerId) params.customer = stripeCustomerId;
    if (input.saveCard) params.setup_future_usage = "off_session";
    if (savedPaymentMethodId) {
      params.payment_method = savedPaymentMethodId;
      // Don't auto-collect a new method for saved-card flow; the client
      // confirms the existing PM. Wallet redirects are off because the
      // user is using a card already on file.
      params.automatic_payment_methods = { enabled: true, allow_redirects: "never" };
    } else {
      params.automatic_payment_methods = { enabled: true };
    }

    const intent = await stripe().paymentIntents.create(params);

    if (!intent.client_secret) {
      throw new Error("no client_secret on payment intent");
    }

    return {
      ok: true,
      bookingId: booking.id as string,
      free: false,
      clientSecret: intent.client_secret,
    };
  } catch (err) {
    console.error("[createBookingAndIntent] stripe failed", err);
    // Roll back: delete the booking, re-activate vouchers, refund points.
    await admin.from("bookings").delete().eq("id", booking.id);
    if (appliedVoucherIds.length > 0) {
      await admin
        .from("loyalty_vouchers")
        .update({ status: "active" })
        .in("id", appliedVoucherIds)
        .eq("client_id", clientId);
    }
    if (pointsApplied > 0) {
      await admin.from("loyalty_ledger").insert({
        tenant_id: tenantId,
        client_id: clientId,
        delta_points: pointsApplied,
        reason: "manual_credit",
        display_label: `Refund: payment failed for ${service.name}`,
      });
    }
    return { ok: false, error: "payment setup failed" };
  }
}
