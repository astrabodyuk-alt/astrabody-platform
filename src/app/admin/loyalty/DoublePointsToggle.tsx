"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleDoublePointsWeek } from "./actions";

export function DoublePointsToggle({
  initialActive,
  initialUntil,
  disabled,
}: {
  initialActive: boolean;
  initialUntil: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [until, setUntil] = useState<string | null>(initialUntil);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    if (disabled || pending) return;
    const next = !active;
    startTransition(async () => {
      const result = await toggleDoublePointsWeek(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActive(next);
      setUntil(result.until);
      setError(null);
      router.refresh();
    });
  }

  const untilLabel = until
    ? new Date(until).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Europe/London",
      })
    : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-[14px] font-medium tracking-snug text-olive">
          {active ? "On" : "Off"}
        </span>
        <span className="text-[12px] tracking-snug text-olive-soft">
          {active && untilLabel
            ? `Doubling until ${untilLabel}`
            : "Toggle on for a week of 2× points on every completed booking."}
        </span>
        {error && (
          <span className="mt-1 text-[12px] text-destructive">{error}</span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={handleToggle}
        disabled={disabled || pending}
        className={cn(
          "relative h-7 w-12 flex-shrink-0 rounded-full border-[0.5px] transition-colors duration-200 ease-ios disabled:opacity-50",
          active
            ? "border-transparent bg-sage"
            : "border-hairline-strong bg-cream-deep"
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-6 w-6 rounded-full bg-white shadow-1 transition-transform duration-200 ease-ios",
            active ? "translate-x-[22px]" : "translate-x-[2px]"
          )}
        />
      </button>
    </div>
  );
}
