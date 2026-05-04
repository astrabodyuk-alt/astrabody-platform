"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateReviewSettings } from "./actions";

interface ReviewShape {
  googleBusinessReviewUrl: string | null;
  reviewBonusVoucherPct: number;
  reviewRequestsPaused: boolean;
}

export function ReviewSettingsForm({
  initial,
  readOnly,
}: {
  initial: ReviewShape;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial.googleBusinessReviewUrl ?? "");
  const [pct, setPct] = useState(initial.reviewBonusVoucherPct);
  const [paused, setPaused] = useState(initial.reviewRequestsPaused);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateReviewSettings({
        googleBusinessReviewUrl: url.trim() || null,
        reviewBonusVoucherPct: pct,
        reviewRequestsPaused: paused,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5">
        <Field label="Google Business review URL">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={readOnly}
            placeholder="https://g.page/r/<id>/review"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
          />
          <p className="text-[11px] tracking-snug text-olive-faint">
            Paste the deep-link from your Google Business Profile dashboard.
            Leave empty to hide the Google CTA from the review flow.
          </p>
        </Field>

        <Field label={`Review bonus voucher: ${pct}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            disabled={readOnly}
            onChange={(e) => setPct(Number(e.target.value))}
            className="h-2 w-full appearance-none rounded-full bg-cream-deep accent-sage disabled:opacity-50"
          />
          <p className="text-[11px] tracking-snug text-olive-faint">
            Granted to clients who confirm they posted a Google review.
            Valid for 90 days.
          </p>
        </Field>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] tracking-snug text-olive">
            Pause review requests
          </span>
          <Toggle
            checked={paused}
            onChange={() => setPaused((v) => !v)}
            label="Pause review requests"
            disabled={readOnly}
          />
        </label>
        {paused && (
          <p className="rounded-[10px] bg-cream-deep/60 px-3 py-2 text-[12px] tracking-snug text-olive-soft">
            Review prompts are paused. Existing requests can still be
            answered by clients, but no new ones will fire when bookings
            complete.
          </p>
        )}

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={readOnly || pending}
          >
            {pending ? "Saving" : "Save changes"}
          </Button>
          {savedAt && !pending && (
            <span className="text-[12px] tracking-snug text-sage-deep">
              Saved ✓
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative h-[31px] w-[51px] flex-shrink-0 rounded-full transition-colors duration-200 ease-ios disabled:opacity-50",
        checked ? "bg-sage" : "bg-[#E9E9EA]"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-ios",
          "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]",
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
