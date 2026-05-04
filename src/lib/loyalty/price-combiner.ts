/**
 * Price combiner — pure, deterministic, no DB calls.
 *
 * Single source of truth for how rewards stack. Used by:
 *   - createBookingAndIntent (server, persistence)
 *   - CheckoutSummary (client, line-item display)
 *
 * Stacking rules:
 *   1. A `free_service` voucher whose `serviceId` matches the booked
 *      service short-circuits everything: final = 0, only that voucher
 *      is marked applied, points and other vouchers are ignored.
 *   2. Otherwise discounts compound additively against the base price:
 *        percent_total = sum(value_pct) of all `percent` vouchers
 *        percentDiscount = base * percent_total / 100
 *        amountDiscount  = sum(value_pence) of all `amount` vouchers
 *        pointsDiscount  = pointsToApply (1 pt = 1 pence)
 *        final = max(0, base - percentDiscount - amountDiscount - pointsDiscount)
 *   3. Stripe minimum charge in GBP is 30 p. If 0 < final < 30, we
 *      round to 0 (the booking goes through the free path) — Nigel's
 *      "no floor; allow £0".
 *
 * This file is intentionally pure JS so it can run on the server inside
 * a server action and on the client inside the summary card without any
 * import boundary issues.
 */

const STRIPE_FLOOR_PENCE = 30;

export interface VoucherForCombiner {
  id: string;
  kind: "percent" | "amount" | "free_service";
  valuePct: number | null;
  valuePence: number | null;
  serviceId: string | null;
}

export interface CombineInput {
  basePence: number;
  serviceId: string;
  /** Already filtered to vouchers the caller wants applied. */
  vouchers: VoucherForCombiner[];
  /** Already capped to the client's current points balance. */
  pointsToApply: number;
}

export interface CombineResult {
  /** What Stripe should charge (or 0 → free path). */
  finalPence: number;
  /** Set when the free_service short-circuit fired. */
  freeServiceVoucherId: string | null;
  /** Voucher ids actually used. Includes the free-service one if matched. */
  appliedVoucherIds: string[];
  /** How many points to debit from the ledger. */
  pointsApplied: number;
  breakdown: {
    base: number;
    percentTotal: number;
    percentDiscount: number;
    amountDiscount: number;
    pointsDiscount: number;
    /** May differ from final if rounded to 0 by the Stripe floor. */
    rawFinal: number;
    final: number;
  };
}

export function combinePrice(input: CombineInput): CombineResult {
  const { basePence, serviceId, vouchers, pointsToApply } = input;

  // Free-service short-circuit.
  const freeMatch = vouchers.find(
    (v) => v.kind === "free_service" && v.serviceId === serviceId
  );
  if (freeMatch) {
    return {
      finalPence: 0,
      freeServiceVoucherId: freeMatch.id,
      appliedVoucherIds: [freeMatch.id],
      pointsApplied: 0,
      breakdown: {
        base: basePence,
        percentTotal: 0,
        percentDiscount: 0,
        amountDiscount: 0,
        pointsDiscount: 0,
        rawFinal: 0,
        final: 0,
      },
    };
  }

  // Compound discounts. Filter to non-free_service for stacking
  // (free_service vouchers that don't match this service are just
  // ignored — they remain spendable on a future booking).
  const stacking = vouchers.filter((v) => v.kind !== "free_service");

  const percentTotal = Math.max(
    0,
    Math.min(
      100,
      stacking
        .filter((v) => v.kind === "percent")
        .reduce((acc, v) => acc + (v.valuePct ?? 0), 0)
    )
  );
  const percentDiscount = Math.floor((basePence * percentTotal) / 100);

  const amountDiscount = Math.max(
    0,
    stacking
      .filter((v) => v.kind === "amount")
      .reduce((acc, v) => acc + (v.valuePence ?? 0), 0)
  );

  // Cap pointsToApply at what's left after voucher discounts so we
  // don't waste points on already-zero amounts.
  const remainingAfterVouchers = Math.max(
    0,
    basePence - percentDiscount - amountDiscount
  );
  const pointsDiscount = Math.max(
    0,
    Math.min(Math.floor(pointsToApply), remainingAfterVouchers)
  );

  const rawFinal = Math.max(
    0,
    basePence - percentDiscount - amountDiscount - pointsDiscount
  );
  const final =
    rawFinal > 0 && rawFinal < STRIPE_FLOOR_PENCE ? 0 : rawFinal;

  return {
    finalPence: final,
    freeServiceVoucherId: null,
    appliedVoucherIds: stacking.map((v) => v.id),
    pointsApplied: pointsDiscount,
    breakdown: {
      base: basePence,
      percentTotal,
      percentDiscount,
      amountDiscount,
      pointsDiscount,
      rawFinal,
      final,
    },
  };
}
