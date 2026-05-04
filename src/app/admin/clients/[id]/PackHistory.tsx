"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

interface InactivePack {
  id: string;
  sessions_total: number;
  sessions_remaining: number;
  status: "active" | "expired" | "cancelled" | "consumed";
  expires_at: string;
  created_at: string;
  service_packages: { name: string } | { name: string }[] | null;
  package_purchases:
    | Array<{
        id: string;
        sold_by: { display_name: string } | { display_name: string }[] | null;
        created_at: string;
      }>
    | null;
}

/**
 * Collapsible "Pack history" — only past packs (consumed, expired,
 * cancelled). Hidden by default to keep the client detail surface
 * focused on what's still spendable.
 */
export function PackHistory({ packs }: { packs: InactivePack[] }) {
  const [open, setOpen] = useState(false);

  if (packs.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-left"
        aria-expanded={open}
      >
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Pack history
        </h2>
        <span className="text-[13px] tracking-snug text-olive-soft">
          ({packs.length}) {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul className="mt-4 flex flex-col gap-2">
          {packs.map((p) => (
            <li key={p.id}>
              <HistoryRow pack={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({ pack }: { pack: InactivePack }) {
  const pkg = pickFirst<{ name: string }>(pack.service_packages);
  const purchase = (pack.package_purchases ?? [])[0];
  const soldBy = pickFirst<{ display_name: string }>(purchase?.sold_by);
  const used = pack.sessions_total - pack.sessions_remaining;

  return (
    <Card className="flex items-baseline justify-between gap-3 p-4">
      <div>
        <p className="text-[14px] font-medium tracking-snug text-olive">
          {pkg?.name ?? "Pack"}
        </p>
        <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
          {used} of {pack.sessions_total} used
          {soldBy ? ` · sold by ${soldBy.display_name}` : ""}
          {purchase ? ` on ${formatShortDate(purchase.created_at)}` : ""}
        </p>
      </div>
      <StatusPill status={pack.status} />
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    consumed: { bg: "rgba(117,133,100,0.16)", fg: "#5C6B4E" },
    expired: { bg: "rgba(62,62,49,0.06)", fg: "rgba(62,62,49,0.62)" },
    cancelled: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
    active: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
  };
  const { bg, fg } = palette[status] ?? palette.expired;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
