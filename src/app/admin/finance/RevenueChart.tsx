"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn, formatGBP } from "@/lib/utils";
import type { RevenuePoint } from "@/lib/finance/queries";

const SAGE_DEEP = "#5C6B4E";
const SAGE_LIGHT = "#BBC4AA";

/**
 * 12-month revenue line chart.
 *
 * Desktop (>= 1024px): both lines visible (TTC sage-deep solid, ex-VAT
 * sage-light dashed). Mobile: a small segmented control picks one of
 * the two lines. When the tenant isn't VAT-registered we render the
 * TTC line only and hide the picker.
 *
 * Hairline grid, no fills, tabular numerals on the axes.
 */
export function RevenueChart({
  series,
  showExVat,
}: {
  series: RevenuePoint[];
  showExVat: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [mobileView, setMobileView] = useState<"ttc" | "exVat">("ttc");

  const data = series.map((p) => ({
    label: p.label,
    monthIso: p.monthIso,
    ttc: p.ttcPence / 100,
    exVat: p.exVatPence / 100,
  }));

  // Decide which lines to render. On desktop we show both when the
  // tenant is VAT-registered. On mobile we show only the selected one.
  const showTtcLine = !showExVat || isDesktop || mobileView === "ttc";
  const showExVatLine =
    showExVat && (isDesktop || mobileView === "exVat");

  return (
    <div className="flex flex-col gap-3">
      {showExVat && !isDesktop && (
        <SegmentedToggle
          options={[
            { id: "ttc", label: "TTC" },
            { id: "exVat", label: "Ex-VAT" },
          ]}
          value={mobileView}
          onChange={(v) => setMobileView(v as "ttc" | "exVat")}
        />
      )}

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="rgba(62,62,49,0.10)"
              strokeWidth={0.5}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "rgba(62,62,49,0.62)",
                fontSize: 11,
                fontFamily: "Inter",
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `£${Math.round(v).toLocaleString("en-GB")}`}
              tick={{
                fill: "rgba(62,62,49,0.62)",
                fontSize: 11,
                fontFamily: "Inter, ui-monospace",
              }}
              width={64}
            />
            <Tooltip
              cursor={{
                stroke: "rgba(62,62,49,0.20)",
                strokeWidth: 0.5,
                strokeDasharray: "4 4",
              }}
              content={<TooltipContent />}
            />
            {showTtcLine && (
              <Line
                type="monotone"
                dataKey="ttc"
                stroke={SAGE_DEEP}
                strokeWidth={1.5}
                dot={{ r: 2.5, stroke: SAGE_DEEP, strokeWidth: 1, fill: "#fff" }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            )}
            {showExVatLine && (
              <Line
                type="monotone"
                dataKey="exVat"
                stroke={SAGE_LIGHT}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2.5, stroke: SAGE_LIGHT, strokeWidth: 1, fill: "#fff" }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showExVat && isDesktop && (
        <div className="flex items-center justify-end gap-4 text-[11px] tracking-snug text-olive-soft">
          <Legend swatch={SAGE_DEEP} label="TTC" />
          <Legend swatch={SAGE_LIGHT} label="Ex-VAT" dashed />
        </div>
      )}
    </div>
  );
}

function Legend({
  swatch,
  label,
  dashed,
}: {
  swatch: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        style={{
          height: 1.5,
          width: 24,
          background: dashed
            ? `repeating-linear-gradient(to right, ${swatch} 0 4px, transparent 4px 8px)`
            : swatch,
        }}
      />
      {label}
    </span>
  );
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-fit rounded-full border-[0.5px] border-hairline-strong bg-white p-0.5">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={selected}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium tracking-snug transition-colors duration-200 ease-ios",
              selected ? "bg-sage text-cream" : "text-olive-soft"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface TooltipPayload {
  payload: {
    label: string;
    monthIso: string;
    ttc: number;
    exVat: number;
  };
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 shadow-1">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {p.label}
      </p>
      <p className="mt-1 text-[13px] font-medium tabular-nums text-olive">
        TTC {formatGBP(Math.round(p.ttc * 100))}
      </p>
      <p className="text-[12px] tabular-nums text-olive-soft">
        Ex-VAT {formatGBP(Math.round(p.exVat * 100))}
      </p>
    </div>
  );
}

/**
 * Tiny media-query hook. SSR returns false so the chart renders the
 * mobile branch on first paint; the desktop branch swaps in after
 * hydration. Trade-off: a brief flash on initial load on a desktop —
 * acceptable here because the chart is below the fold for first paint.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [query]);
  return matches;
}
