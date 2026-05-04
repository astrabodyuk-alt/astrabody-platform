"use client";

import { cn } from "@/lib/utils";

/**
 * iOS-style Toggle (51 × 31, white knob with shadow, sage on / iOS-grey
 * off, 200ms ease-ios). One canonical implementation used everywhere
 * across the app — never re-invent inline.
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
        "relative h-[31px] w-[51px] flex-shrink-0 rounded-full transition-colors duration-200 ease-ios",
        "disabled:opacity-50 disabled:cursor-not-allowed",
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
