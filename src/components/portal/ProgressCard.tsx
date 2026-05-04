"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * ProgressCard — Apple Health-inspired stat card with a sparkline.
 *
 * Two big numbers on top in Cormorant + Inter delta, then a 60 px
 * sparkline below using sage-deep stroke and a sage-tinted area fill.
 */
export interface ProgressCardProps {
  /** Top-left big stat. */
  primaryStat: {
    value: string;
    delta?: string;
    label: string;
  };
  /** Top-right big stat (right-aligned). */
  secondaryStat: {
    value: string;
    delta?: string;
    label: string;
  };
  /** Sparkline data — array of numeric values, normalised internally. */
  series: number[];
  className?: string;
}

export function ProgressCard({
  primaryStat,
  secondaryStat,
  series,
  className,
}: ProgressCardProps) {
  // Normalise series into an SVG path within a 320x60 viewport.
  const path = buildSparkPath(series, 320, 60);

  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex items-baseline justify-between">
        <Stat {...primaryStat} />
        <Stat {...secondaryStat} align="right" />
      </div>
      <svg
        className="block h-[60px] w-full"
        viewBox="0 0 320 60"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="ax-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#758564" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#758564" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path.area}`} fill="url(#ax-spark-fill)" />
        <path
          d={path.line}
          fill="none"
          stroke="#5C6B4E"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle
          cx={path.lastX}
          cy={path.lastY}
          r="3"
          fill="#5C6B4E"
        />
      </svg>
    </Card>
  );
}

function Stat({
  value,
  delta,
  label,
  align = "left",
}: {
  value: string;
  delta?: string;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="font-serif text-[32px] font-medium leading-none tracking-tightest text-sage-deep">
        {value}
        {delta && (
          <span className="ml-1 font-sans text-[13px] font-medium text-sage">
            {delta}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </div>
    </div>
  );
}

function buildSparkPath(series: number[], width: number, height: number) {
  if (series.length < 2) {
    return { area: "", line: "", lastX: 0, lastY: 0 };
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const points = series.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * (height - 8) - 4,
  }));

  const line = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return { area, line, lastX: last.x, lastY: last.y };
}
