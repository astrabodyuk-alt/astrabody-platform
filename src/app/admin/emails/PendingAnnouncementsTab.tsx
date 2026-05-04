"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CommsProposalBar } from "@/components/admin/CommsProposalBar";
import type { SegmentQuery } from "@/lib/email/segments-shared";

interface ProposalRow {
  id: string;
  trigger_kind: string;
  trigger_summary: string;
  draft_subject: string | null;
  draft_body_md: string | null;
  default_segment: unknown;
  status: string;
  created_at: string;
}

export function PendingAnnouncementsTab({
  proposals,
  services,
}: {
  proposals: ProposalRow[];
  services: Array<{ id: string; name: string }>;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = proposals.filter((p) => !hidden.has(p.id));

  if (visible.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          No pending announcements. Anything you change in admin that affects
          clients will queue an optional email here.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((p) => {
        const segment = parseSegment(p.default_segment);
        const created = new Date(p.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return (
          <Card key={p.id} className="p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-snug text-olive-soft">
              <span>{kindLabel(p.trigger_kind)}</span>
              <span>·</span>
              <span>{created}</span>
            </div>
            <CommsProposalBar
              proposalId={p.id}
              triggerSummary={p.trigger_summary}
              defaultSegment={segment}
              initialDraft={{
                subject: p.draft_subject,
                bodyMd: p.draft_body_md,
              }}
              services={services}
              onResolved={() =>
                setHidden((h) => new Set(h).add(p.id))
              }
            />
          </Card>
        );
      })}
    </div>
  );
}

function parseSegment(value: unknown): SegmentQuery {
  if (
    value &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>)
  ) {
    return value as SegmentQuery;
  }
  return { type: "all" };
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "studio_closure":
      return "Studio closure";
    case "bank_holiday_closure":
      return "Bank holiday closure";
    case "working_hours_change":
      return "Hours change";
    case "service_price_change":
      return "Price change";
    case "new_service":
      return "New service";
    case "flash_slot":
      return "Flash slot";
    case "new_package":
      return "New pack";
    case "loyalty_promotion":
      return "Loyalty promotion";
    case "studio_reopening":
      return "Reopening";
    case "win_back":
      return "Win-back";
    default:
      return kind;
  }
}
