"use client";

import { cn } from "@/lib/utils";

/**
 * iOS-style Toggle — one canonical implementation for the entire app.
 * Never re-define this inline.
 *
 * Key implementation notes:
 *   - `overflow-hidden` on the button clips the absolute knob so it can
 *     never escape the rounded-full container (fixes the "knob peeking
 *     outside the circle" bug that appeared without it).
 *   - `left-0` anchors the knob to the left edge before `translateX` is
 *     applied, making the motion deterministic across every browser.
 *
 * Usage:
 *   <Toggle checked={value} onChange={() => setValue(!value)} label="Apply rewards" />
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
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
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={cn(
        "relative h-[31px] w-[51px] flex-shrink-0 overflow-hidden rounded-full",
        "transition-colors duration-200 ease-ios",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-sage" : "bg-[#E9E9EA]"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white",
          "transition-transform duration-200 ease-ios",
          "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]",
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}
