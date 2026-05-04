"use client";

import { useState, useTransition } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import { purchaseGiftCard } from "@/lib/gift-cards/actions";

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

const PRESETS = [
  { label: "£39", pence: 3900 },
  { label: "£80", pence: 8000 },
  { label: "£160", pence: 16000 },
];

const MIN_CUSTOM = 20;
const MAX_CUSTOM = 500;

export function GiftSessionCard() {
  const [amountPence, setAmountPence] = useState<number>(3900);
  const [isCustom, setIsCustom] = useState(false);
  const [customPounds, setCustomPounds] = useState<string>("50");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "paying"; clientSecret: string; giftCardId: string }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function effectiveAmount(): number {
    if (!isCustom) return amountPence;
    const v = Math.round(Number(customPounds));
    if (!Number.isFinite(v)) return 0;
    return v * 100;
  }

  function startCheckout(): void {
    setError(null);
    const amount = effectiveAmount();
    if (
      isCustom &&
      (amount < MIN_CUSTOM * 100 || amount > MAX_CUSTOM * 100)
    ) {
      setError(`Custom amount must be £${MIN_CUSTOM} – £${MAX_CUSTOM}.`);
      return;
    }
    if (!recipientName.trim()) {
      setError("Add the recipient's name.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail.trim())) {
      setError("Recipient email looks wrong.");
      return;
    }

    setStage({ kind: "starting" });
    startTransition(async () => {
      const res = await purchaseGiftCard({
        amountPence: amount,
        recipientName,
        recipientEmail,
        personalMessage: message,
      });
      if (!res.ok) {
        setError(res.error);
        setStage({ kind: "idle" });
        return;
      }
      setStage({
        kind: "paying",
        clientSecret: res.clientSecret,
        giftCardId: res.giftCardId,
      });
    });
  }

  if (stage.kind === "paying") {
    return (
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          <Gift className="size-3.5" />
          Pay {formatGBP(effectiveAmount())} for the gift
        </div>
        <Elements
          stripe={getStripe()}
          options={{
            clientSecret: stage.clientSecret,
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
          <PayInner
            giftCardId={stage.giftCardId}
            amount={effectiveAmount()}
          />
        </Elements>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Gift className="size-4 text-sage" />
        <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
          Gift a Session
        </h2>
      </div>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        Treat someone to the Astrabody experience. Delivered by email with
        a unique code, valid for 12 months.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <span className="text-[12px] tracking-snug text-olive-soft">
            Choose an amount
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.pence}
                type="button"
                onClick={() => {
                  setIsCustom(false);
                  setAmountPence(p.pence);
                }}
                className={
                  !isCustom && amountPence === p.pence
                    ? "rounded-full border border-sage bg-sage px-3 py-1.5 text-[13px] font-medium text-cream"
                    : "rounded-full border border-olive/15 bg-cream px-3 py-1.5 text-[13px] text-olive hover:border-sage/40 hover:bg-sage/5"
                }
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={
                isCustom
                  ? "rounded-full border border-sage bg-sage px-3 py-1.5 text-[13px] font-medium text-cream"
                  : "rounded-full border border-olive/15 bg-cream px-3 py-1.5 text-[13px] text-olive hover:border-sage/40 hover:bg-sage/5"
              }
            >
              Custom
            </button>
          </div>
          {isCustom && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[14px] text-olive">£</span>
              <input
                type="number"
                min={MIN_CUSTOM}
                max={MAX_CUSTOM}
                step={1}
                value={customPounds}
                onChange={(e) => setCustomPounds(e.target.value)}
                className="w-28 rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
              <span className="text-[12px] tracking-snug text-olive-soft">
                £{MIN_CUSTOM}–£{MAX_CUSTOM}, whole pounds
              </span>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] tracking-snug text-olive-soft">
            Recipient name
          </span>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] tracking-snug text-olive-soft">
            Recipient email
          </span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="them@example.com"
            className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] tracking-snug text-olive-soft">
            Personal message (optional)
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            rows={3}
            maxLength={200}
            placeholder="A short note for the email"
            className="resize-y rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
          />
          <span className="self-end text-[10px] tracking-snug text-olive-soft">
            {message.length}/200
          </span>
        </label>

        {error && <p className="text-[13px] text-destructive">{error}</p>}

        <Button
          type="button"
          onClick={startCheckout}
          disabled={pending || stage.kind === "starting"}
          className="w-full"
        >
          {stage.kind === "starting" || pending
            ? "One sec"
            : `Add to gift bag · ${formatGBP(effectiveAmount())}`}
        </Button>
      </div>
    </Card>
  );
}

function PayInner({
  giftCardId,
  amount,
}: {
  giftCardId: string;
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const { error: payError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/api/gift-cards/${giftCardId}/confirm`,
      },
    });
    if (payError) {
      setError(payError.message ?? "Payment failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
      <PaymentElement
        options={{ layout: { type: "tabs", defaultCollapsed: false } }}
      />
      <Button
        type="submit"
        variant="pay"
        className="w-full"
        disabled={busy || !stripe || !elements}
      >
        {busy ? "Processing" : `Pay ${formatGBP(amount)}`}
      </Button>
      {error && (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-center text-[11px] text-olive-faint">
        Secured by Stripe · 256-bit encryption
      </p>
    </form>
  );
}
