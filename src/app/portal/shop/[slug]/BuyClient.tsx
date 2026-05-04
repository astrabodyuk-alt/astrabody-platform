"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import type { computeProductPrice } from "@/lib/shop/pricing";
import { createProductIntent } from "./actions";

let _stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

type PriceResult = ReturnType<typeof computeProductPrice>;

/**
 * Two-step buy flow:
 *   1. The product page renders a "Get it" CTA. On click we call
 *      createProductIntent(slug). Free path → push to the order page.
 *      Paid path → reveal Stripe Elements bound to the returned client
 *      secret.
 *   2. The Pay button confirms the PaymentIntent. Stripe redirects to
 *      /api/products/<purchaseId>/confirm which flips status='paid'
 *      and lands the buyer on /portal/shop/orders/<purchaseId>.
 */
export function BuyClient({
  slug,
  productName,
  price,
}: {
  slug: string;
  productName: string;
  price: PriceResult;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "paying"; clientSecret: string; purchaseId: string }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cta = price.free ? "Get it free" : `Buy for ${formatGBP(price.finalPence)}`;

  function handleStart() {
    setError(null);
    setStage({ kind: "starting" });
    startTransition(async () => {
      const r = await createProductIntent(slug);
      if (!r.ok) {
        setError(r.error);
        setStage({ kind: "idle" });
        return;
      }
      if (r.free) {
        router.push(`/portal/shop/orders/${r.purchaseId}`);
        return;
      }
      setStage({
        kind: "paying",
        clientSecret: r.clientSecret,
        purchaseId: r.purchaseId,
      });
    });
  }

  if (stage.kind === "paying") {
    return (
      <Card className="mt-6 p-5">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Pay {formatGBP(price.finalPence)} to download
        </p>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {productName}
        </p>
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
            purchaseId={stage.purchaseId}
            amount={price.finalPence}
          />
        </Elements>
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-5">
      <PriceLine price={price} />
      {error && (
        <p className="mt-3 text-[12px] text-destructive">{error}</p>
      )}
      <Button
        type="button"
        variant="primary"
        className="mt-4 w-full"
        onClick={handleStart}
        disabled={pending || stage.kind === "starting"}
      >
        {stage.kind === "starting" || pending ? "One sec" : cta}
      </Button>
    </Card>
  );
}

function PayInner({
  purchaseId,
  amount,
}: {
  purchaseId: string;
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const { error: payError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/api/products/${purchaseId}/confirm`,
      },
    });
    if (payError) {
      setError(payError.message ?? "Payment failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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

function PriceLine({ price }: { price: PriceResult }) {
  if (price.reason === "free_studio_insider") {
    return (
      <div className="flex items-baseline gap-3">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
          style={{
            background: "rgba(117,133,100,0.16)",
            color: "#5C6B4E",
          }}
        >
          Yours, free
        </span>
        <span className="text-[12px] tracking-snug text-olive-soft">
          Studio Insider perk
        </span>
      </div>
    );
  }
  if (price.reason === "insider_discount") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[28px] font-medium tabular-nums text-sage-deep">
          {formatGBP(price.finalPence)}
        </span>
        <span className="text-[14px] text-olive-soft line-through tabular-nums">
          {formatGBP(price.originalPence)}
        </span>
        <span className="text-[12px] tracking-snug text-olive-soft">
          Insider tier
        </span>
      </div>
    );
  }
  return (
    <span className="font-serif text-[28px] font-medium tabular-nums text-olive">
      {formatGBP(price.finalPence)}
    </span>
  );
}
