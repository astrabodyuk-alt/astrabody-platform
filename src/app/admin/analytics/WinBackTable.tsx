"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";
import { CommsProposalBar } from "@/components/admin/CommsProposalBar";
import { createWinBackProposal } from "@/lib/analytics/winback-actions";
import type { WinBackRow } from "@/lib/analytics/queries";

export function WinBackTable({ rows }: { rows: WinBackRow[] }) {
  const [activeProposal, setActiveProposal] = useState<{
    id: string;
    summary: string;
    clientId: string;
  } | null>(null);

  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          Nobody's lapsed past the 60-day mark right now.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <ul className="flex flex-col divide-y divide-olive/10">
        {rows.map((r) => (
          <WinBackRowItem
            key={r.clientId}
            row={r}
            onProposal={(id, summary) =>
              setActiveProposal({ id, summary, clientId: r.clientId })
            }
          />
        ))}
      </ul>

      {activeProposal && (
        <div className="border-t border-olive/10 bg-cream-deep/50 p-4">
          <CommsProposalBar
            proposalId={activeProposal.id}
            triggerSummary={activeProposal.summary}
            defaultSegment={{ type: "all" }}
            onResolved={() => setActiveProposal(null)}
          />
        </div>
      )}
    </Card>
  );
}

function WinBackRowItem({
  row,
  onProposal,
}: {
  row: WinBackRow;
  onProposal: (proposalId: string, summary: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href={`/admin/clients/${row.clientId}`}
          className="text-[14px] font-medium text-olive hover:underline"
        >
          {row.fullName}
        </Link>
        <div className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
          {row.totalSessions} session{row.totalSessions === 1 ? "" : "s"} ·{" "}
          {formatGBP(row.totalSpentPence)} lifetime
        </div>
        <div className="text-[11px] tracking-snug text-olive-soft">
          Last visit {format(new Date(row.lastBookingAt), "d MMM yyyy")} · {row.daysLapsed}{" "}
          days lapsed
        </div>
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await createWinBackProposal(row.clientId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            onProposal(res.proposalId, `Win-back: ${row.fullName}`);
          })
        }
      >
        {pending ? "Drafting…" : "Send win-back"}
      </Button>
    </li>
  );
}
