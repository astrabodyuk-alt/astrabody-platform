"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Download, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminDeleteWaitlistEntry } from "@/lib/waitlist/actions";

export interface AdminWaitlistRow {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  service_name: string;
  staff_name: string | null;
  preferred_date: string;
  preferred_window: "morning" | "afternoon" | "evening" | "any";
  notified_at: string | null;
  expires_at: string;
  created_at: string;
}

export function WaitlistTab({
  rows,
  isOwnerOrAdmin,
}: {
  rows: AdminWaitlistRow[];
  isOwnerOrAdmin: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.client_name.toLowerCase().includes(q) ||
        (r.client_email ?? "").toLowerCase().includes(q) ||
        r.service_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function exportCsv(): void {
    const header = [
      "Client",
      "Email",
      "Phone",
      "Service",
      "Date",
      "Window",
      "Practitioner",
      "Status",
      "Added",
    ].join(",");
    const lines = filtered.map((r) =>
      [
        csv(r.client_name),
        csv(r.client_email ?? ""),
        csv(r.client_phone ?? ""),
        csv(r.service_name),
        r.preferred_date,
        r.preferred_window,
        csv(r.staff_name ?? "Anyone"),
        statusOf(r),
        r.created_at,
      ].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          The waitlist is empty.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-olive/15 bg-cream px-3 py-2">
          <Search className="size-4 text-olive-soft" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, email, or service"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-olive placeholder:text-olive-soft/70 focus:outline-none"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={exportCsv}
          className="gap-1.5"
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {filtered.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            Nothing matches that search.
          </li>
        )}
        {filtered.map((r) => (
          <WaitlistRow
            key={r.id}
            row={r}
            isOwnerOrAdmin={isOwnerOrAdmin}
          />
        ))}
      </ul>
    </Card>
  );
}

function WaitlistRow({
  row,
  isOwnerOrAdmin,
}: {
  row: AdminWaitlistRow;
  isOwnerOrAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const status = statusOf(row);
  const dateLabel = new Date(`${row.preferred_date}T00:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  );
  const added = new Date(row.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium text-olive">
            {row.client_name}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="text-[12px] tracking-snug text-olive-soft">
          {row.service_name} · {dateLabel} · {windowLabel(row.preferred_window)}
        </div>
        <div className="text-[11px] tracking-snug text-olive-soft">
          With {row.staff_name ?? "Anyone"} · added {added}
        </div>
      </div>
      {isOwnerOrAdmin && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await adminDeleteWaitlistEntry(row.id);
              router.refresh();
            })
          }
          aria-label="Remove entry"
          className="gap-1"
        >
          <Trash2 className="size-3.5" />
          Remove
        </Button>
      )}
    </li>
  );
}

function StatusBadge({
  status,
}: {
  status: "Waiting" | "Notified" | "Expired";
}) {
  if (status === "Notified") {
    return (
      <span className="rounded-full bg-sage/20 px-2 py-0.5 text-[11px] tracking-snug text-sage-deep">
        Notified
      </span>
    );
  }
  if (status === "Expired") {
    return (
      <span className="rounded-full bg-olive/10 px-2 py-0.5 text-[11px] tracking-snug text-olive-soft">
        Expired
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] tracking-snug text-olive">
      Waiting
    </span>
  );
}

function statusOf(r: AdminWaitlistRow): "Waiting" | "Notified" | "Expired" {
  if (r.notified_at) return "Notified";
  if (new Date(r.expires_at).getTime() < Date.now()) return "Expired";
  return "Waiting";
}

function windowLabel(w: AdminWaitlistRow["preferred_window"]): string {
  switch (w) {
    case "morning":
      return "Morning";
    case "afternoon":
      return "Afternoon";
    case "evening":
      return "Evening";
    default:
      return "Any time";
  }
}

function csv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
