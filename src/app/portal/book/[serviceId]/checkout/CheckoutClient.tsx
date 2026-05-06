"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";
import { combinePrice } from "@/lib/loyalty/price-combiner";
import type { WalletVoucher } from "@/lib/loyalty/wallet";
import { CheckoutSummary } from "./CheckoutSummary";
import { createBookingAndIntent } from "./actions";
import { validateGiftCard } from "@/lib/gift-cards/actions";

/**
 * /portal/book/[serviceId]/checkout — interactive surface.
 *
 * Renders BOTH the form column and the summary column in a 2-up grid
 * (single column on mobile). Owns the `applyRewards` toggle state so
 * the toggle in the summary can drive Stripe's displayed total in the
 * form, and so the line items + Stripe stay in lock-step.
 *
 * Stripe canon styling is restricted to the PaymentElement — Apple
 * canon for everything else.
 */

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

interface Props {
  serviceId: string;
  serviceName: string;
  staffName: string;
  startsAtIso: string;
  pricePence: number;
  depositPence: number;
  /** Set when this booking redeems a free_service reward from /portal/me. */
  redemptionId?: string | null;
  /** Override default-staff resolution. null = "any" → server falls back. */
  staffId?: string | null;
  /** Wallet snapshot — drives the line items + apply toggle. */
  wallet: { currentPoints: number; vouchers: WalletVoucher[] };
  /**
   * When set, this booking consumes one session from this client_packages
   * row. Forces the FreeBookingFlow (no Stripe, no rewards stacking).
   */
  useClientPackageId?: string | null;
  /**
   * Resource scope (services with multiple physical units). Forwarded
   * verbatim to the booking action; "any" tells the server to pick.
   */
  resourceId?: string | null;
  /** Tenant cancellation policy — three-line summary above the Pay button. */
  cancellationPolicy: {
    enabled: boolean;
    lines: string[];
  };
  /**
   * If the client already has a default card on file, the brand + last4
   * are surfaced in the express-checkout pill. null otherwise.
   */
  savedCard: { brand: string; last4: string } | null;
}

export function CheckoutClient(props: Props) {
  const baseAmount =
    props.depositPence > 0 ? props.depositPence : props.pricePence;
  const redemptionActive = !!props.redemptionId;
  const packActive = !!props.useClientPackageId;

  const [applyRewards, setApplyRewards] = useState(true);
  // Save-card consent. CHECKED by default — card on file is the standard
  // for all paid bookings (no-show protection). Client can uncheck.
  const [saveCard, setSaveCard] = useState(true);
  // Express-checkout: returning client wants to use the saved card.
  // Defaults to true if a saved card exists; client can hit "Use a
  // different card" to fall back to Stripe Elements.
  const [useSavedCard, setUseSavedCard] = useState<boolean>(!!props.savedCard);

  // Gift-card redemption. Validate is async (server check); when accepted
  // we hold the balance and code so the residual can be subtracted from
  // finalAmount and forwarded to the booking action.
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [giftCardOpen, setGiftCardOpen] = useState(false);

  // Combine the price every render. Pure, fast.
  const combined = useMemo(() => {
    if (redemptionActive || packActive || !applyRewards) {
      // Redemption path, pack-consumption path, or the toggle is off.
      // No discounts to compute — base goes through unchanged. (For the
      // pack path the server already forced base to 0.)
      return combinePrice({
        basePence: baseAmount,
        serviceId: props.serviceId,
        vouchers: [],
        pointsToApply: 0,
      });
    }
    // Toggle on: send all applicable vouchers and all available points.
    const usable = props.wallet.vouchers.filter((v) => {
      // free_service vouchers only apply if they target this service.
      if (v.kind === "free_service") return v.serviceId === props.serviceId;
      return true;
    });
    return combinePrice({
      basePence: baseAmount,
      serviceId: props.serviceId,
      vouchers: usable.map((v) => ({
        id: v.id,
        kind: v.kind,
        valuePct: v.valuePct,
        valuePence: v.valuePence,
        serviceId: v.serviceId,
      })),
      pointsToApply: props.wallet.currentPoints,
    });
  }, [
    redemptionActive,
    packActive,
    applyRewards,
    baseAmount,
    props.serviceId,
    props.wallet.vouchers,
    props.wallet.currentPoints,
  ]);

  const giftCardApplied =
    giftCardBalance != null
      ? Math.min(giftCardBalance, combined.finalPence)
      : 0;
  const finalAmount = Math.max(0, combined.finalPence - giftCardApplied);
  const giftCardCodeForBooking = giftCardBalance != null ? giftCardCode : null;
  const isFree = finalAmount === 0;

  const stripePromise = useMemo(() => (isFree ? null : getStripe()), [isFree]);

  // Build the start-of-day Date once for the summary.
  const startsAtDate = useMemo(
    () => new Date(props.startsAtIso),
    [props.startsAtIso]
  );

  const SummaryCol = (
    <CheckoutSummary
      serviceName={props.serviceName}
      staffName={props.staffName}
      startsAt={startsAtDate}
      pricePence={props.pricePence}
      depositPence={props.depositPence}
      wallet={props.wallet}
      combined={combined}
      applyRewards={applyRewards}
      onToggleApplyRewards={setApplyRewards}
      redemptionActive={redemptionActive}
    />
  );

  const giftCardRow = (
    <GiftCardRow
      open={giftCardOpen}
      setOpen={setGiftCardOpen}
      code={giftCardCode}
      setCode={setGiftCardCode}
      balance={giftCardBalance}
      setBalance={setGiftCardBalance}
      applied={giftCardApplied}
      error={giftCardError}
      setError={setGiftCardError}
    />
  );

  const formColumn = isFree ? (
    <FreeBookingFlow
      serviceId={props.serviceId}
      startsAtIso={props.startsAtIso}
      redemptionId={props.redemptionId ?? null}
      staffId={props.staffId ?? null}
      useClientPackageId={props.useClientPackageId ?? null}
      resourceId={props.resourceId ?? null}
      applyVoucherIds={
        applyRewards && !redemptionActive && !packActive
          ? combined.appliedVoucherIds
          : []
      }
      applyPoints={
        applyRewards && !redemptionActive && !packActive
          ? combined.pointsApplied
          : 0
      }
      giftCardCode={giftCardCodeForBooking}
    />
  ) : (
    <Elements
      stripe={stripePromise!}
      options={{
        mode: "payment",
        amount: finalAmount,
        currency: "gbp",
        paymentMethodCreation: "manual",
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#5C6B4E",
            colorBackground: "#FFFFFF",
            colorText: "#3E3E31",
            colorTextSecondary: "rgba(62,62,49,0.62)",
            colorDanger: "#D45B5B",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeightNormal: "400",
            fontWeightMedium: "500",
            spacingUnit: "4px",
            borderRadius: "12px",
          },
          rules: {
            ".Input": {
              borderColor: "rgba(62,62,49,0.14)",
              boxShadow: "0 1px 2px rgba(62,62,49,0.05)",
            },
            ".Input:focus": {
              borderColor: "#758564",
              boxShadow: "0 0 0 2px rgba(117,133,100,0.4)",
            },
          },
        },
      }}
    >
      <PaidCheckoutForm
        serviceId={props.serviceId}
        startsAtIso={props.startsAtIso}
        amount={finalAmount}
        depositPence={props.depositPence}
        redemptionId={props.redemptionId ?? null}
        staffId={props.staffId ?? null}
        useClientPackageId={null}
        resourceId={props.resourceId ?? null}
        savedCard={props.savedCard}
        useSavedCard={useSavedCard && !!props.savedCard}
        onUseDifferentCard={() => setUseSavedCard(false)}
        saveCard={saveCard}
        onToggleSaveCard={(v) => setSaveCard(v)}
        cancellationPolicy={props.cancellationPolicy}
        applyVoucherIds={
          applyRewards && !redemptionActive ? combined.appliedVoucherIds : []
        }
        applyPoints={applyRewards && !redemptionActive ? combined.pointsApplied : 0}
        giftCardCode={giftCardCodeForBooking}
      />
    </Elements>
  );

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-1 flex-col gap-3">
        {giftCardRow}
        {formColumn}
      </div>
      <aside className="md:sticky md:top-8 md:self-start">{SummaryCol}</aside>
    </div>
  );
}

interface SubmitInputs {
  serviceId: string;
  startsAtIso: string;
  redemptionId: string | null;
  staffId: string | null;
  useClientPackageId: string | null;
  resourceId: string | null;
  applyVoucherIds: string[];
  applyPoints: number;
  giftCardCode: string | null;
}

interface PaidExtras {
  saveCard: boolean;
  onToggleSaveCard: (next: boolean) => void;
  savedCard: { brand: string; last4: string } | null;
  /** When true, the parent decided we should use the saved PM. */
  useSavedCard: boolean;
  onUseDifferentCard: () => void;
  cancellationPolicy: { enabled: boolean; lines: string[] };
}

function PaidCheckoutForm({
  serviceId,
  startsAtIso,
  amount,
  depositPence,
  redemptionId,
  staffId,
  useClientPackageId,
  resourceId,
  applyVoucherIds,
  applyPoints,
  giftCardCode,
  saveCard,
  onToggleSaveCard,
  savedCard,
  useSavedCard,
  onUseDifferentCard,
  cancellationPolicy,
}: SubmitInputs & { amount: number; depositPence: number } & PaidExtras) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live-update Stripe Elements when the apply toggle changes the amount
  // (the parent re-renders; we re-issue elements.update).
  useEffect(() => {
    if (!elements || amount <= 0 || useSavedCard) return;
    elements.update({ amount });
  }, [elements, amount, useSavedCard]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || busy) return;

    setBusy(true);
    setError(null);

    if (!useSavedCard) {
      if (!elements) {
        setError("Payment form not ready yet.");
        setBusy(false);
        return;
      }
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check your details.");
        setBusy(false);
        return;
      }
    }

    const result = await createBookingAndIntent({
      serviceId,
      startsAtIso,
      redemptionId,
      staffId,
      useClientPackageId,
      resourceId: (resourceId as string | "any" | null) ?? null,
      applyVoucherIds,
      applyPoints,
      giftCardCode,
      saveCard,
      useSavedCard,
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.free) {
      // Gift card / vouchers covered the bill — skip Stripe.
      window.location.assign(`/portal/booking/${result.bookingId}/confirmed`);
      return;
    }

    if (useSavedCard) {
      // Saved-card path: the PI was created with the saved PM attached
      // server-side. Confirm using only the clientSecret — Stripe.js
      // will surface SCA inline if the issuer requires it.
      const { error: payError, paymentIntent } = await stripe.confirmCardPayment(
        result.clientSecret
      );
      if (payError) {
        setError(payError.message ?? "Payment failed");
        setBusy(false);
        return;
      }
      if (paymentIntent && paymentIntent.status === "succeeded") {
        window.location.assign(
          `/api/bookings/${result.bookingId}/confirm?payment_intent=${paymentIntent.id}&redirect_status=succeeded`
        );
        return;
      }
      setError("Payment is processing. Refresh in a moment.");
      setBusy(false);
      return;
    }

    const { error: payError } = await stripe.confirmPayment({
      elements: elements!,
      clientSecret: result.clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/api/bookings/${result.bookingId}/confirm`,
      },
    });
    if (payError) {
      setError(payError.message ?? "Payment failed");
      setBusy(false);
    }
  }

  const buttonLabel = useSavedCard && savedCard
    ? `Pay ${formatGBP(amount)} with ${cardBrandLabel(savedCard.brand)} •• ${savedCard.last4}`
    : depositPence > 0
      ? `Pay ${formatGBP(amount)} deposit`
      : `Pay ${formatGBP(amount)}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {cancellationPolicy.enabled && cancellationPolicy.lines.length > 0 && (
        <PolicyBox lines={cancellationPolicy.lines} />
      )}

      {savedCard && useSavedCard ? (
        <SavedCardPill
          savedCard={savedCard}
          onUseDifferentCard={onUseDifferentCard}
        />
      ) : (
        <PaymentElement
          options={{
            layout: { type: "tabs", defaultCollapsed: false },
          }}
        />
      )}

      {!useSavedCard && (
        <SaveCardConsent
          checked={saveCard}
          onChange={onToggleSaveCard}
        />
      )}

      <Button
        type="submit"
        variant="pay"
        className="w-full"
        disabled={busy || !stripe || (!useSavedCard && !elements)}
      >
        {busy ? "Processing" : buttonLabel}
      </Button>
      {error && (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function FreeBookingFlow({
  serviceId,
  startsAtIso,
  redemptionId,
  staffId,
  useClientPackageId,
  resourceId,
  applyVoucherIds,
  applyPoints,
  giftCardCode,
}: SubmitInputs) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await createBookingAndIntent({
      serviceId,
      startsAtIso,
      redemptionId,
      staffId,
      useClientPackageId,
      resourceId: (resourceId as string | "any" | null) ?? null,
      applyVoucherIds,
      applyPoints,
      giftCardCode,
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/portal/booking/${result.bookingId}/confirmed`);
  }

  const copy = useClientPackageId
    ? "Using one session from your pack."
    : redemptionId
      ? "Your reward covers this session."
      : applyVoucherIds.length > 0 || applyPoints > 0
        ? "Your rewards cover this session."
        : "Nothing to pay today. We'll see you on the day.";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] tracking-snug text-olive-soft">{copy}</p>
      <Button
        type="button"
        variant="primary"
        className="w-full"
        onClick={handleConfirm}
        disabled={busy}
      >
        {busy ? "Confirming" : "Confirm booking"}
      </Button>
      {error && (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PolicyBox({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-[14px] border-[0.5px] border-hairline bg-cream-deep/50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        Cancellation policy
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((l, i) => (
          <li key={i} className="text-[13px] tracking-snug text-olive">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SavedCardPill({
  savedCard,
  onUseDifferentCard,
}: {
  savedCard: { brand: string; last4: string };
  onUseDifferentCard: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border-[0.5px] border-sage/30 bg-sage/10 px-4 py-3">
      <span className="flex items-center gap-2 text-[13px] tracking-snug text-sage-deep">
        <span aria-hidden>•</span>
        <span>
          Use saved {cardBrandLabel(savedCard.brand)} ending{" "}
          <span className="tabular-nums">•• {savedCard.last4}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={onUseDifferentCard}
        className="text-[12px] font-medium tracking-snug text-sage-deep underline-offset-2 hover:underline"
      >
        Use a different card
      </button>
    </div>
  );
}

function SaveCardConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Stripe security notice */}
      <div className="flex items-start gap-2.5 rounded-[12px] border-[0.5px] border-sage/20 bg-sage/5 px-4 py-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-0.5 h-4 w-4 shrink-0 text-sage"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="text-[12px] font-medium leading-snug text-sage-deep">
            Your card details are held by Stripe, not Astrabody.
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-olive-soft">
            We never see or store your full card number. Stripe is PCI-DSS Level 1
            certified — the highest standard in the industry.
          </p>
        </div>
      </div>

      {/* Save-card checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border-[0.5px] border-hairline bg-white px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-sage"
        />
        <span className="flex flex-col gap-1">
          <span className="text-[13px] leading-snug text-olive">
            Save my card for one-tap rebooking
          </span>
          <span className="text-[11px] text-olive-faint">
            We may charge a late-cancellation or no-show fee per our policy.
            Remove your card any time in Settings.
          </span>
        </span>
      </label>
    </div>
  );
}

function cardBrandLabel(brand: string): string {
  if (!brand) return "card";
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "Amex",
    discover: "Discover",
    diners: "Diners",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return map[brand.toLowerCase()] ?? brand;
}

function GiftCardRow({
  open,
  setOpen,
  code,
  setCode,
  balance,
  setBalance,
  applied,
  error,
  setError,
}: {
  open: boolean;
  setOpen: (next: boolean) => void;
  code: string;
  setCode: (next: string) => void;
  balance: number | null;
  setBalance: (next: number | null) => void;
  applied: number;
  error: string | null;
  setError: (next: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function check(): Promise<void> {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await validateGiftCard(code);
    if (!res.ok) {
      setBalance(null);
      setError(res.error);
      setBusy(false);
      return;
    }
    setBalance(res.balancePence);
    setBusy(false);
  }

  function clear(): void {
    setCode("");
    setBalance(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full border border-olive/15 bg-cream px-3 py-1.5 text-[12px] tracking-snug text-olive-soft hover:border-sage/40 hover:bg-sage/5 hover:text-olive"
      >
        Have a gift card?
      </button>
    );
  }

  if (balance != null) {
    return (
      <div className="rounded-xl border border-sage/20 bg-sage/5 px-4 py-3 text-[13px] tracking-snug text-olive">
        Gift card applied — {formatGBP(applied)} off this booking
        {balance > applied ? (
          <span className="block text-[12px] text-olive-soft">
            {formatGBP(balance - applied)} remains for next time.
          </span>
        ) : null}
        <button
          type="button"
          onClick={clear}
          className="ml-2 text-[12px] underline-offset-2 hover:underline"
        >
          remove
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-olive/15 bg-cream px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Gift card code"
          className="min-w-0 flex-1 rounded-lg border border-olive/15 bg-cream px-3 py-2 font-mono text-[13px] uppercase text-olive"
        />
        <Button
          type="button"
          size="sm"
          onClick={check}
          disabled={!code.trim() || busy}
        >
          {busy ? "Checking" : "Apply"}
        </Button>
        <button
          type="button"
          onClick={() => {
            clear();
            setOpen(false);
          }}
          className="text-[12px] tracking-snug text-olive-soft hover:text-olive"
        >
          cancel
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-destructive">{error}</p>
      )}
    </div>
  );
}
