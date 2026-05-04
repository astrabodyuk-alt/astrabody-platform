"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  loadStripe,
  type Stripe,
  type StripeElements,
} from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createPortalSetupIntent,
  recordCardFromSetupIntent,
  removeSavedCard,
} from "./actions";

interface SavedCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  savedAt: string | null;
}

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

export function PaymentMethodSection({
  savedCard,
}: {
  savedCard: SavedCard | null;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    if (!confirm("Remove this card? You can add it again later.")) return;
    setError(null);
    startTransition(async () => {
      const r = await removeSavedCard();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!savedCard) {
    return (
      <>
        <p className="text-[14px] tracking-snug text-olive">
          Add a card to enable one-tap rebooking and pack purchases.
        </p>
        <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
          We never store your full card number. Stripe handles all that. You
          can remove the card any time.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAdd(true)}
          >
            Add a card
          </Button>
        </div>
        {showAdd && (
          <AddCardModal
            mode="add"
            onClose={() => setShowAdd(false)}
            onSaved={() => {
              setShowAdd(false);
              router.refresh();
            }}
          />
        )}
        {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-[14px] border-[0.5px] border-hairline bg-cream-deep/40 px-4 py-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sage-deep"
        >
          •
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-medium tracking-snug text-olive">
            {cardBrandLabel(savedCard.brand)} ending{" "}
            <span className="tabular-nums">•• {savedCard.last4}</span>
          </p>
          <p className="mt-0.5 text-[12px] tabular-nums tracking-snug text-olive-soft">
            Expires {String(savedCard.expMonth).padStart(2, "0")}/
            {String(savedCard.expYear).slice(-2)}
            {savedCard.savedAt
              ? ` · added ${new Date(savedCard.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowAdd(true)}
          disabled={pending}
        >
          Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={pending}
          className="text-olive-soft hover:text-destructive"
        >
          {pending ? "Removing" : "Remove"}
        </Button>
      </div>

      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

      {showAdd && (
        <AddCardModal
          mode="replace"
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function AddCardModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: "add" | "replace";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await createPortalSetupIntent();
      if (cancelled) return;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setClientSecret(r.clientSecret);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stripePromise = useMemo(() => getStripe(), []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-olive/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[440px] rounded-[16px] bg-white p-5 shadow-1">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[20px] font-medium tracking-tight text-olive">
            {mode === "replace" ? "Replace your card" : "Add a card"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[14px] text-olive-soft hover:text-olive"
          >
            ✕
          </button>
        </div>
        {error && (
          <p className="mb-3 rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        )}
        {!clientSecret && !error && (
          <p className="text-[13px] tracking-snug text-olive-soft">
            Preparing the card form…
          </p>
        )}
        {clientSecret && (
          <Elements
            stripe={stripePromise!}
            options={{
              clientSecret,
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
              },
            }}
          >
            <CardForm
              onSaved={onSaved}
              onError={(msg) => setError(msg)}
              onCancel={onClose}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

function CardForm({
  onSaved,
  onError,
  onCancel,
}: {
  onSaved: () => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (!stripe || !elements || busy) return;
    setBusy(true);
    onError("");
    const { error: submitError } = await elements.submit();
    if (submitError) {
      onError(submitError.message ?? "Please check your details.");
      setBusy(false);
      return;
    }
    // Confirm without redirect so the SCA challenge (if any) happens
    // inline in the modal.
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements: elements as StripeElements,
      redirect: "if_required",
    });
    if (confirmError) {
      onError(confirmError.message ?? "Couldn't save card.");
      setBusy(false);
      return;
    }
    if (!setupIntent || setupIntent.status !== "succeeded") {
      onError(`Card setup status is ${setupIntent?.status ?? "unknown"}.`);
      setBusy(false);
      return;
    }
    const r = await recordCardFromSetupIntent(setupIntent.id);
    if (!r.ok) {
      onError(r.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement options={{ layout: { type: "tabs", defaultCollapsed: false } }} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="text-olive-soft"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleConfirm}
          disabled={busy || !stripe}
        >
          {busy ? "Saving" : "Save card"}
        </Button>
      </div>
      <p className={cn("text-center text-[11px] text-olive-faint")}>
        Secured by Stripe · 256-bit encryption
      </p>
    </div>
  );
}

function cardBrandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "Amex",
  };
  return map[(brand ?? "").toLowerCase()] ?? brand ?? "card";
}
