"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Send {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  body_html: string;
  email_templates:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  clients:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
}

const STATUSES = ["all", "queued", "sent", "delivered", "bounced", "failed"];

export function HistoryTab({ sends }: { sends: Send[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Send | null>(null);

  const templateNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of sends) {
      const t = pickFirst<{ name: string }>(s.email_templates);
      if (t?.name) names.add(t.name);
    }
    return Array.from(names);
  }, [sends]);
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  const filtered = sends.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (templateFilter !== "all") {
      const t = pickFirst<{ name: string }>(s.email_templates);
      if ((t?.name ?? "") !== templateFilter) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const t = pickFirst<{ name: string }>(s.email_templates);
      const c = pickFirst<{
        full_name: string | null;
        email: string | null;
      }>(s.clients);
      const haystack = [
        s.subject,
        s.to_email,
        t?.name ?? "",
        c?.full_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search subject, recipient, template"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 max-w-full rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1 placeholder:text-olive-faint"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "Any status" : s}
            </option>
          ))}
        </select>
        {templateNames.length > 0 && (
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="h-10 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1"
          >
            <option value="all">Any template</option>
            {templateNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        <span className="text-[12px] tabular-nums tracking-snug text-olive-soft">
          {filtered.length} of {sends.length}
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b-[0.5px] border-hairline">
              <Th>Date</Th>
              <Th>To</Th>
              <Th>Subject</Th>
              <Th>Template</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const tpl = pickFirst<{ name: string }>(s.email_templates);
              return (
                <tr
                  key={s.id}
                  className="cursor-pointer border-b-[0.5px] border-hairline last:border-b-0 hover:bg-cream-deep/40"
                  onClick={() => setActive(s)}
                >
                  <Td>{formatDateTime(s.sent_at ?? s.created_at)}</Td>
                  <Td>{s.to_email}</Td>
                  <Td>{s.subject}</Td>
                  <Td>{tpl?.name ?? "—"}</Td>
                  <Td>
                    <StatusPill status={s.status} />
                  </Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-[13px] tracking-snug text-olive-soft"
                >
                  No sends match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Sheet
        open={!!active}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <SheetContent className="!max-w-[680px]">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.subject}</SheetTitle>
                <SheetDescription>
                  To {active.to_email} ·{" "}
                  {formatDateTime(active.sent_at ?? active.created_at)}
                </SheetDescription>
              </SheetHeader>
              {active.error && (
                <p className="mb-3 rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] tracking-snug text-destructive">
                  {active.error}
                </p>
              )}
              <iframe
                title="email preview"
                srcDoc={active.body_html}
                className="h-[60vh] w-full rounded-[12px] border-[0.5px] border-hairline bg-white"
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    queued: { bg: "rgba(62,62,49,0.06)", fg: "rgba(62,62,49,0.62)" },
    sent: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    delivered: { bg: "rgba(117,133,100,0.16)", fg: "#5C6B4E" },
    bounced: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
    failed: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
  };
  const { bg, fg } = palette[status] ?? palette.queued;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-[13px] tracking-snug text-olive">
      {children}
    </td>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  })} · ${d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase()}`;
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
