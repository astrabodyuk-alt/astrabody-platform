"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateCancellationPolicy } from "./actions";
import { Toggle } from "@/components/ui/toggle";

interface PolicyShape {
  enabled: boolean;
  noshowChargePct: number;
  lateCancelChargePct: number;
  lateCancelCutoffHours: number;
  customText: string | null;
}

/**
 * Sliders + text override + a live preview of what the client will see
 * at checkout. Owner / admin gated server-side.
 */
export function CancellationPolicyForm({
  initial,
  readOnly,
}: {
  initial: PolicyShape;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [noshow, setNoshow] = useState(initial.noshowChargePct);
  const [late, setLate] = useState(initial.lateCancelChargePct);
  const [cutoff, setCutoff] = useState(initial.lateCancelCutoffHours);
  const [custom, setCustom] = useState(initial.customText ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const previewLines = useMemo(() => {
    if (!enabled) return ["No cancellation fees apply."];
    const trimmed = custom.trim();
    if (trimmed) return trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return [
      `No-show: ${noshow}% of session price.`,
      `Cancel within ${cutoff}h: ${late}%.`,
      `Cancel earlier: free, anytime.`,
    ];
  }, [enabled, custom, noshow, late, cutoff]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateCancellationPolicy({
        enabled,
        noshowChargePct: noshow,
        lateCancelChargePct: late,
        lateCancelCutoffHours: cutoff,
        customText: custom,
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] tracking-snug text-olive">
            Enable cancellation policy
          </span>
          <Toggle
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
            label="Enable cancellation policy"
            disabled={readOnly}
          />
        </div>

        <div className={cn("mt-5 flex flex-col gap-5", !enabled && "opacity-50")}>
          <Slider
            label="No-show charge"
            min={0}
            max={100}
            step={5}
            value={noshow}
            onChange={setNoshow}
            disabled={readOnly || !enabled}
            suffix="%"
          />
          <Slider
            label="Late-cancel charge"
            min={0}
            max={100}
            step={5}
            value={late}
            onChange={setLate}
            disabled={readOnly || !enabled}
            suffix="%"
          />
          <Field label="Late-cancel cutoff (hours before)">
            <input
              type="number"
              min={0}
              max={168}
              step={1}
              disabled={readOnly || !enabled}
              value={cutoff}
              onChange={(e) =>
                setCutoff(Math.max(0, Math.min(168, Number(e.target.value) || 0)))
              }
              className="h-11 w-32 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1 disabled:opacity-50"
            />
          </Field>
          <Field label="Custom policy text (optional, overrides preview)">
            <textarea
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={readOnly || !enabled}
              rows={4}
              placeholder="Leave empty to use the auto-generated three-line summary."
              className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 text-[14px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
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
      </Card>

      <Card className="self-start p-5">
        <h3 className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Live preview
        </h3>
        <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
          What the client sees above the Pay button.
        </p>
        <div className="mt-3 rounded-[14px] border-[0.5px] border-hairline bg-cream-deep/50 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Cancellation policy
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {previewLines.map((l, i) => (
              <li key={i} className="text-[13px] tracking-snug text-olive">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          {label}
        </span>
        <span className="text-[14px] font-medium tabular-nums text-olive">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full appearance-none rounded-full bg-cream-deep accent-sage disabled:opacity-50"
      />
    </div>
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
