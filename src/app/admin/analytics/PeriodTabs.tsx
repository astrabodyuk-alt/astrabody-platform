"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod } from "@/lib/analytics/queries";

const OPTIONS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
];

export function PeriodTabs({ current }: { current: AnalyticsPeriod }) {
  const params = useSearchParams();

  function buildHref(value: AnalyticsPeriod): string {
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.set("period", value);
    return `/admin/analytics?${sp.toString()}`;
  }

  return (
    <nav
      aria-label="Period"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={buildHref(opt.value)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-1.5 text-[13px] tracking-snug",
            opt.value === current
              ? "border-sage bg-sage font-medium text-cream"
              : "border-olive/15 bg-cream text-olive hover:border-sage/40 hover:bg-sage/5"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </nav>
  );
}
