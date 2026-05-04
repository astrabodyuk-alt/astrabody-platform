"use client";

import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";

export interface CommissionRow {
  id: string;
  amount_pence: number;
  rate_pct: number;
  status: "pending" | "paid" | "void";
  created_at: string;
  paid_at: string | null;
  bookings:
    | {
        id: string;
        starts_at: string;
        price_pence: number;
        services: { name: string } | { name: string }[] | null;
        clients:
          | { full_name: string | null; email: string | null }
          | { full_name: string | null; email: string | null }[]
          | null;
      }
    | null;
}

/**
 * Read-only table of commission rows, used on /admin/me and inside the
 * /admin/payroll staff drawer. No actions — payroll's drawer overlays
 * its own action footer separately.
 */
export function CommissionsTable({ rows }: { rows: CommissionRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          Nothing yet. Commissions land when a booking transitions to
          confirmed.
        </p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-[0.5px] border-hairline">
            <Th>Date</Th>
            <Th>Service</Th>
            <Th>Client</Th>
            <Th align="right">Sale</Th>
            <Th align="right">Rate</Th>
            <Th align="right">Commission</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Row({ row }: { row: CommissionRow }) {
  const booking = row.bookings;
  const service = pickFirst<{ name: string }>(booking?.services);
  const client = pickFirst<{ full_name: string | null; email: string | null }>(
    booking?.clients
  );
  const date = booking?.starts_at ?? row.created_at;
  return (
    <tr className="border-b-[0.5px] border-hairline last:border-b-0">
      <Td>{formatDate(date)}</Td>
      <Td>{service?.name ?? "—"}</Td>
      <Td>{client?.full_name ?? client?.email ?? "—"}</Td>
      <Td align="right">
        {booking ? formatGBP(booking.price_pence) : "—"}
      </Td>
      <Td align="right">{Number(row.rate_pct).toFixed(1)}%</Td>
      <Td align="right" strong>
        {formatGBP(row.amount_pence)}
      </Td>
      <Td>
        <StatusPill status={row.status} />
      </Td>
    </tr>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={
        "px-4 py-3 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  strong,
}: {
  children: React.ReactNode;
  align?: "right";
  strong?: boolean;
}) {
  return (
    <td
      className={
        "px-4 py-3 text-[13px] tracking-snug tabular-nums " +
        (align === "right" ? "text-right " : "") +
        (strong ? "font-medium text-olive" : "text-olive")
      }
    >
      {children}
    </td>
  );
}

function StatusPill({ status }: { status: "pending" | "paid" | "void" }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "rgba(184,148,90,0.10)", fg: "#B8945A" },
    paid: { bg: "rgba(117,133,100,0.16)", fg: "#5C6B4E" },
    void: { bg: "rgba(62,62,49,0.06)", fg: "rgba(62,62,49,0.62)" },
  };
  const { bg, fg } = palette[status];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
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
