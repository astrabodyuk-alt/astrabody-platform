"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ReviewRow {
  id: string;
  status: string;
  npsScore: number | null;
  npsComment: string | null;
  triggerReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  googleReviewClicked: boolean;
  googleReviewConfirmedAt: string | null;
  clientId: string | null;
  clientName: string;
}

type FilterId = "all" | "promoter" | "passive" | "detractor" | "no_response";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "promoter", label: "Promoters (9–10)" },
  { id: "passive", label: "Passive (7–8)" },
  { id: "detractor", label: "Detractors (≤ 6)" },
  { id: "no_response", label: "No response yet" },
];

const TRIGGER_LABELS: Record<string, string> = {
  first_session: "First session",
  programme_complete: "Programme complete",
  milestone_5: "5th session",
  milestone_10: "10th session",
};

export function ReviewsList({ rows }: { rows: ReviewRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "no_response") return r.npsScore === null;
      const score = r.npsScore ?? -1;
      if (filter === "promoter") return score >= 9;
      if (filter === "passive") return score >= 7 && score <= 8;
      if (filter === "detractor") return score >= 0 && score <= 6;
      return true;
    });
  }, [rows, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={cn(
                "rounded-full border-[0.5px] px-3 py-1.5 text-[12px] font-medium tracking-snug transition-colors duration-200 ease-ios",
                active
                  ? "border-transparent bg-sage text-cream"
                  : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
              )}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[12px] tabular-nums tracking-snug text-olive-soft">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            Nothing matches that filter yet.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Card className="flex items-baseline gap-4 p-4">
                <ScorePill score={r.npsScore} />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[14px] font-medium tracking-snug text-olive">
                      {r.clientId ? (
                        <Link
                          href={`/admin/clients/${r.clientId}`}
                          className="hover:underline"
                        >
                          {r.clientName}
                        </Link>
                      ) : (
                        r.clientName
                      )}
                    </p>
                    <span className="text-[11px] tabular-nums tracking-snug text-olive-soft">
                      {formatRelative(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                    {r.triggerReason
                      ? TRIGGER_LABELS[r.triggerReason] ?? r.triggerReason
                      : "—"}
                    {r.googleReviewConfirmedAt
                      ? " · Google review posted ✓"
                      : r.googleReviewClicked
                        ? " · Google link clicked"
                        : r.status === "dismissed"
                          ? " · dismissed"
                          : ""}
                  </p>
                  {r.npsComment && (
                    <p className="mt-2 rounded-[10px] bg-cream-deep/50 px-3 py-2 text-[13px] leading-relaxed tracking-snug text-olive">
                      {r.npsComment}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-medium tabular-nums"
        style={{
          background: "rgba(62,62,49,0.06)",
          color: "rgba(62,62,49,0.62)",
        }}
      >
        —
      </span>
    );
  }
  let bg = "rgba(62,62,49,0.06)";
  let fg = "#3E3E31";
  if (score >= 9) {
    bg = "rgba(117,133,100,0.16)";
    fg = "#5C6B4E";
  } else if (score >= 7) {
    bg = "rgba(184,148,90,0.10)";
    fg = "#B8945A";
  } else {
    bg = "rgba(212,91,91,0.10)";
    fg = "#D45B5B";
  }
  return (
    <span
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-serif text-[16px] font-medium tabular-nums"
      style={{ background: bg, color: fg }}
    >
      {score}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}
