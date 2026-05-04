"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  submitNps,
  markGoogleClicked,
  confirmGoogleReview,
  dismissReviewRequest,
} from "./actions";

interface Props {
  reviewId: string;
  firstName: string;
  status: string;
  npsScore: number | null;
  npsComment: string | null;
  googleClicked: boolean;
  googleConfirmedAt: string | null;
  /** Tenant's Google Business review deep-link. Null when unconfigured. */
  googleReviewUrl: string | null;
  voucherPct: number;
}

/**
 * Three steps, gated server-side:
 *   1. NPS slider (when nps_score is null)
 *   2. Google review CTA + post-click "did you post?" prompt
 *      (only rendered when score ≥ 9)
 *   3. Internal-only thank-you (when score < 9)
 *
 * The Google CTA is HARD-GATED server-side too — even if a client
 * forges the score state, the action layer rejects markGoogleClicked /
 * confirmGoogleReview when nps_score < 9.
 */
export function ReviewClient(props: Props) {
  const showNpsForm = props.npsScore === null;
  const isPromoter = (props.npsScore ?? 0) >= 9;

  if (showNpsForm) {
    return <NpsStep reviewId={props.reviewId} firstName={props.firstName} />;
  }

  if (isPromoter) {
    return (
      <GoogleStep
        reviewId={props.reviewId}
        firstName={props.firstName}
        googleReviewUrl={props.googleReviewUrl}
        googleClicked={props.googleClicked}
        googleConfirmedAt={props.googleConfirmedAt}
        voucherPct={props.voucherPct}
      />
    );
  }

  return <FeedbackThanksStep firstName={props.firstName} />;
}

// ---- Step 1: NPS ----------------------------------------------------

function NpsStep({
  reviewId,
  firstName,
}: {
  reviewId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [score, setScore] = useState<number>(8);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await submitNps({ reviewRequestId: reviewId, score, comment });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          How was it, {firstName}?
        </h1>
        <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
          On a scale of 0 to 10, would you recommend us to a friend?
        </p>
      </header>

      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] tracking-snug text-olive-soft">
            Not great
          </span>
          <span className="font-serif text-[36px] font-medium leading-none tabular-nums text-sage-deep transition-transform duration-150 ease-ios">
            {score}
          </span>
          <span className="text-[12px] tracking-snug text-olive-soft">
            Loved it
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          aria-label="NPS score"
          className={cn(
            "mt-4 h-3 w-full appearance-none rounded-full bg-cream-deep",
            "accent-sage",
            "transition-transform duration-150 ease-ios active:scale-[1.01]"
          )}
        />
        <div className="mt-2 flex justify-between text-[10px] tabular-nums tracking-snug text-olive-faint">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className={cn(score === i && "font-medium text-olive")}
            >
              {i}
            </span>
          ))}
        </div>
      </Card>

      {!showComment ? (
        <button
          type="button"
          onClick={() => setShowComment(true)}
          className="self-start text-[13px] font-medium tracking-snug text-sage-deep underline-offset-2 hover:underline"
        >
          Add a reason for your score (optional)
        </button>
      ) : (
        <Card className="p-5">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
              What&rsquo;s the main reason for your score?
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Optional. We genuinely read these."
              className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
            />
          </label>
        </Card>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <Button
        type="button"
        variant="primary"
        className="w-full"
        onClick={handleSubmit}
        disabled={pending}
      >
        {pending ? "Sending" : "Submit"}
      </Button>
    </div>
  );
}

// ---- Step 2: Google review (promoters) ------------------------------

function GoogleStep({
  reviewId,
  firstName,
  googleReviewUrl,
  googleClicked,
  googleConfirmedAt,
  voucherPct,
}: {
  reviewId: string;
  firstName: string;
  googleReviewUrl: string | null;
  googleClicked: boolean;
  googleConfirmedAt: string | null;
  voucherPct: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    pct: number;
    expiresAt: string;
  } | null>(
    googleConfirmedAt
      ? { pct: voucherPct, expiresAt: googleConfirmedAt }
      : null
  );

  function handleClickGoogle() {
    setError(null);
    if (!googleReviewUrl) {
      setError(
        "Google review link isn't set up yet. Tell the studio and we'll sort it."
      );
      return;
    }
    // Open in a new tab THEN record the click. Don't block the user
    // on a server round-trip — the tab opens immediately.
    window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await markGoogleClicked(reviewId);
      router.refresh();
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmGoogleReview(reviewId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmed({ pct: r.voucherPct, expiresAt: r.voucherExpiresAt });
      router.refresh();
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      await dismissReviewRequest(reviewId);
      router.refresh();
    });
  }

  if (confirmed) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Thank you, {firstName} ✨
        </h1>
        <Card className="p-5">
          <p className="text-[14px] tracking-snug text-olive">
            We&rsquo;ve added a {confirmed.pct}% voucher to your wallet.
          </p>
          <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
            Use it on any session in the next 90 days. It&rsquo;s waiting in{" "}
            <a className="text-sage-deep underline" href="/portal">
              your portal
            </a>
            .
          </p>
        </Card>
      </div>
    );
  }

  if (googleClicked) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Did you post your review?
        </h1>
        <p className="text-[14px] tracking-snug text-olive-soft">
          If you did, we&rsquo;ll add the {voucherPct}% voucher to your wallet
          right now.
        </p>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="primary"
                className="w-full sm:w-auto"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "One sec" : "Yes, I posted"}
          </Button>
          <Button
            type="button"
            variant="ghost"
                className="w-full text-olive-soft sm:w-auto"
            onClick={handleDismiss}
            disabled={pending}
          >
            Not yet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
        Help us share Astrabody, {firstName}.
      </h1>
      <p className="text-[14px] tracking-snug text-olive-soft">
        Would you leave us a quick Google review? Takes about 10 seconds and
        we&rsquo;ll add a {voucherPct}% voucher for your next session as a
        thank-you.
      </p>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
            className="w-full sm:w-auto"
          onClick={handleClickGoogle}
          disabled={pending || !googleReviewUrl}
        >
          Leave a Google review
        </Button>
        <Button
          type="button"
          variant="ghost"
            className="w-full text-olive-soft sm:w-auto"
          onClick={handleDismiss}
          disabled={pending}
        >
          Maybe later
        </Button>
      </div>
    </div>
  );
}

// ---- Step 3: Detractor / passive thank-you --------------------------

function FeedbackThanksStep({ firstName }: { firstName: string }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
        Thank you for the honest answer, {firstName}.
      </h1>
      <p className="text-[14px] leading-relaxed tracking-snug text-olive-soft">
        We&rsquo;ve passed your note straight to the team and it stays
        internal. If you&rsquo;d like to add anything else, reply to the email
        we just sent and we&rsquo;ll come back to you personally.
      </p>
      <p className="text-[13px] tracking-snug text-olive-soft">
        See you soon either way.
      </p>
    </div>
  );
}
