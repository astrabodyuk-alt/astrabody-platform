"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateReferralSettings } from "./actions";

interface InitialState {
  enabled: boolean;
  referrerPence: number;
  referredPence: number;
  minBookingPence: number;
}

export function ReferralProgrammeForm({
  initial,
  disabled,
}: {
  initial: InitialState;
  disabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [referrerPounds, setReferrerPounds] = useState(
    String(Math.round(initial.referrerPence / 100))
  );
  const [referredPounds, setReferredPounds] = useState(
    String(Math.round(initial.referredPence / 100))
  );
  const [minBookingPounds, setMinBookingPounds] = useState(
    String(Math.round(initial.minBookingPence / 100))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save(): void {
    setError(null);
    setSaved(false);
    const referrer = Math.round(Number(referrerPounds)) * 100;
    const referred = Math.round(Number(referredPounds)) * 100;
    const min = Math.round(Number(minBookingPounds)) * 100;
    if (![referrer, referred, min].every((v) => Number.isFinite(v) && v >= 0)) {
      setError("All amounts must be zero or positive.");
      return;
    }
    startTransition(async () => {
      const res = await updateReferralSettings({
        enabled,
        referrerPence: referrer,
        referredPence: referred,
        minBookingPence: min,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] tracking-snug text-olive">
        Reward existing clients for spreading the word. Both sides get
        credit when their referred friend completes their first session.
      </p>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-olive/10 bg-sand/20 px-3 py-2.5">
        <span className="text-[14px] text-olive">Enable referral programme</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={disabled}
          className="size-5 rounded border-olive/15 text-sage focus:ring-sage"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PoundField
          label="Referrer reward"
          value={referrerPounds}
          onChange={setReferrerPounds}
          disabled={disabled}
        />
        <PoundField
          label="Referred reward"
          value={referredPounds}
          onChange={setReferredPounds}
          disabled={disabled}
        />
        <PoundField
          label="Min booking value"
          value={minBookingPounds}
          onChange={setMinBookingPounds}
          disabled={disabled}
        />
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {saved && (
        <p className="text-[12px] tracking-snug text-sage-deep">Saved.</p>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={disabled || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PoundField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] tracking-snug text-olive-soft">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-olive/15 bg-cream px-3 py-2">
        <span className="text-[14px] text-olive-soft">£</span>
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-transparent text-[14px] text-olive focus:outline-none"
        />
      </div>
    </label>
  );
}
