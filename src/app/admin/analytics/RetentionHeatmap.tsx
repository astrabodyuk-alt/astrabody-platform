import { format } from "date-fns";
import type { HeatmapResult } from "@/lib/analytics/queries";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function RetentionHeatmap({ data }: { data: HeatmapResult }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[420px] grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1.5">
        {/* Header row */}
        <div />
        {DAYS.map((d, i) => (
          <div
            key={`h-${i}`}
            className="text-center text-[10px] uppercase tracking-snug text-olive-soft"
          >
            {d}
          </div>
        ))}

        {data.weeks.map((row, w) => (
          <WeekRow key={`w-${w}`} row={row} />
        ))}
      </div>

      <Legend />
    </div>
  );
}

function WeekRow({ row }: { row: HeatmapResult["weeks"][number] }) {
  const monday = row[0]?.ymd;
  const label = monday
    ? format(new Date(`${monday}T00:00:00`), "d MMM")
    : "";
  return (
    <>
      <div className="text-right text-[11px] tabular-nums text-olive-soft">
        {label}
      </div>
      {row.map((cell, i) => (
        <Cell key={`${cell.ymd}-${i}`} ymd={cell.ymd} count={cell.count} />
      ))}
    </>
  );
}

function Cell({ ymd, count }: { ymd: string; count: number }) {
  const colour = countToColour(count);
  const tip = `${count === 0 ? "No sessions" : count === 1 ? "1 session" : `${count} sessions`} on ${format(new Date(`${ymd}T00:00:00`), "d MMM")}`;
  return (
    <div
      title={tip}
      aria-label={tip}
      className="aspect-square rounded-md"
      style={{ backgroundColor: colour }}
    />
  );
}

function countToColour(n: number): string {
  if (n <= 0) return "#F6F3EE"; // cream
  if (n <= 2) return "#BBC4AA"; // sage-light
  if (n <= 5) return "#758564"; // sage
  return "#3E3E31"; // olive
}

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-2 text-[11px] tracking-snug text-olive-soft">
      <span>Less</span>
      <Swatch colour="#F6F3EE" />
      <Swatch colour="#BBC4AA" />
      <Swatch colour="#758564" />
      <Swatch colour="#3E3E31" />
      <span>More</span>
    </div>
  );
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="h-3 w-3 rounded-sm"
      style={{ backgroundColor: colour }}
    />
  );
}
