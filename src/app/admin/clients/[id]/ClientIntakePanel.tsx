"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { IntakeField } from "@/lib/forms/shared";

export interface ClientIntakeRow {
  id: string;
  formName: string;
  fields: IntakeField[];
  answers: Record<string, string>;
  submitted_at: string | null;
  expires_at: string;
  created_at: string;
  booking_starts_at: string | null;
  service_name: string | null;
}

export function ClientIntakePanel({ rows }: { rows: ClientIntakeRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="mt-4 p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          No intake forms on file for this client yet.
        </p>
      </Card>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <IntakeCard row={r} />
        </li>
      ))}
    </ul>
  );
}

function IntakeCard({ row }: { row: ClientIntakeRow }) {
  const [expanded, setExpanded] = useState(false);
  const status = describeStatus(row);
  const dateLabel = row.booking_starts_at
    ? format(new Date(row.booking_starts_at), "d MMM yyyy")
    : format(new Date(row.created_at), "d MMM yyyy");

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-olive">
            {row.formName}
          </div>
          <div className="text-[12px] tracking-snug text-olive-soft">
            {row.service_name ? `${row.service_name} · ` : ""}
            {dateLabel}
          </div>
          <StatusPill status={status} />
        </div>
        {row.submitted_at && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "View"}
          </Button>
        )}
      </div>

      {expanded && row.submitted_at && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-olive/10 pt-3">
          {row.fields.map((f) => (
            <li key={f.id} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-snug text-olive-soft">
                {f.label}
              </span>
              {f.type === "signature" ? (
                row.answers[f.id] ? (
                  <div className="rounded-lg border border-olive/10 bg-white p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.answers[f.id]}
                      alt={f.label}
                      className="h-32 w-full object-contain"
                    />
                  </div>
                ) : (
                  <span className="text-[12px] tracking-snug text-olive-soft">
                    (no signature)
                  </span>
                )
              ) : (
                <span className="whitespace-pre-line text-[13px] tracking-snug text-olive">
                  {row.answers[f.id] || "—"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function describeStatus(
  row: ClientIntakeRow
): "Completed" | "Pending" | "Expired" {
  if (row.submitted_at) return "Completed";
  if (new Date(row.expires_at).getTime() < Date.now()) return "Expired";
  return "Pending";
}

function StatusPill({
  status,
}: {
  status: "Completed" | "Pending" | "Expired";
}) {
  if (status === "Completed") {
    return (
      <span className="mt-1 inline-block rounded-full bg-sage/20 px-2 py-0.5 text-[11px] tracking-snug text-sage-deep">
        Completed
      </span>
    );
  }
  if (status === "Expired") {
    return (
      <span className="mt-1 inline-block rounded-full bg-olive/10 px-2 py-0.5 text-[11px] tracking-snug text-olive-soft">
        Expired
      </span>
    );
  }
  return (
    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] tracking-snug text-amber-900">
      Pending
    </span>
  );
}
