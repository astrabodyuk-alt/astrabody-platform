"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from "lucide-react";
import { cn, formatGBP, formatPoints } from "@/lib/utils";
import { differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  source: string;
  bookings_count: number;
  last_booking_at: string | null;
  total_spend_pence: number;
  lifetime_points: number;
  tier: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type ClientStatus = "new" | "active" | "inactive" | "lapsed" | "never";

function getClientStatus(row: Row): ClientStatus {
  if (!row.last_booking_at) return row.bookings_count === 0 ? "never" : "lapsed";
  const days = differenceInDays(new Date(), new Date(row.last_booking_at));
  if (days <= 30 && row.bookings_count <= 2) return "new";
  if (days <= 60) return "active";
  if (days <= 180) return "inactive";
  return "lapsed";
}

const STATUS_CONFIG: Record<ClientStatus, { label: string; bg: string; fg: string; dot: string }> = {
  new:      { label: "New client",  bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E",  dot: "#758564" },
  active:   { label: "Active",      bg: "rgba(62,62,49,0.06)",    fg: "#3E3E31",  dot: "#3E3E31" },
  inactive: { label: "Inactive",    bg: "rgba(184,148,90,0.10)",  fg: "#B8945A",  dot: "#B8945A" },
  lapsed:   { label: "Lapsed",      bg: "rgba(212,91,91,0.08)",   fg: "#B84848",  dot: "#D45B5B" },
  never:    { label: "No bookings", bg: "rgba(62,62,49,0.05)",    fg: "#9E9E7F",  dot: "#BBC4AA" },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: "#DED2C3", fg: "#3E3E31" },
  { bg: "#BBC4AA", fg: "#3E3E31" },
  { bg: "#758564", fg: "#F6F3EE" },
  { bg: "#EFEAE2", fg: "#758564" },
];

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]!;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{ width: size, height: size, background: color.bg, color: color.fg }}
    >
      {initials || "?"}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const ALL_STATUSES: ClientStatus[] = ["new", "active", "inactive", "lapsed", "never"];

export function ClientsTable({ rows }: { rows: Row[] }) {
  const [globalFilter, setGlobalFilter]     = useState("");
  const [statusFilter, setStatusFilter]     = useState<ClientStatus | "all">("all");
  const [sorting, setSorting]               = useState<SortingState>([{ id: "last_booking_at", desc: true }]);

  // Pre-compute status for each row
  const rowsWithStatus = useMemo(
    () => rows.map((r) => ({ ...r, _status: getClientStatus(r) })),
    [rows]
  );

  const columns = useMemo<ColumnDef<(typeof rowsWithStatus)[0]>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Client",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5 min-w-[160px]">
            <Avatar name={row.original.full_name || "?"} />
            <div className="min-w-0">
              <Link
                href={`/admin/clients/${row.original.id}`}
                className="block text-[13px] font-medium text-olive hover:text-sage truncate max-w-[140px]"
              >
                {row.original.full_name || "—"}
              </Link>
              <p className="text-[11px] text-olive/40 tabular-nums">
                {row.original.bookings_count} session{row.original.bookings_count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Contact",
        cell: ({ row }) => (
          <div className="min-w-[170px]">
            <p className="text-[12px] text-olive/70 truncate max-w-[200px]">
              {row.original.email || "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-olive/40 tabular-nums">
              {row.original.phone || ""}
            </p>
          </div>
        ),
      },
      {
        id: "_status",
        accessorFn: (r) => r._status,
        header: "Status",
        cell: ({ row }) => <StatusPill status={row.original._status} />,
        filterFn: (row, _id, value) => value === "all" || row.original._status === value,
      },
      {
        accessorKey: "tier",
        header: "Tier",
        cell: ({ row }) => <TierPill tier={row.original.tier} />,
      },
      {
        accessorKey: "total_spend_pence",
        header: "Spend",
        cell: ({ row }) => (
          <span className="text-[12px] font-medium tabular-nums text-olive">
            {formatGBP(row.original.total_spend_pence)}
          </span>
        ),
      },
      {
        accessorKey: "lifetime_points",
        header: "Points",
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-olive/70">
            {formatPoints(row.original.lifetime_points)}
          </span>
        ),
      },
      {
        accessorKey: "last_booking_at",
        header: "Last visit",
        cell: ({ row }) => (
          <span className="text-[12px] text-olive/50">
            {row.original.last_booking_at
              ? new Date(row.original.last_booking_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/admin/clients/${row.original.id}`}
            className="flex items-center gap-1 text-[11px] font-medium text-sage opacity-0 transition-opacity group-hover/row:opacity-100 hover:underline"
          >
            View <ExternalLink size={10} strokeWidth={2} />
          </Link>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: rowsWithStatus,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, value) => {
      if (statusFilter !== "all" && row.original._status !== statusFilter) return false;
      if (!value) return true;
      const v = String(value).toLowerCase();
      return [row.original.full_name, row.original.email, row.original.phone].some((s) =>
        (s ?? "").toLowerCase().includes(v)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  // Recompute when statusFilter changes
  useMemo(() => { table.setGlobalFilter(globalFilter); }, [statusFilter]); // eslint-disable-line

  // Count per status
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rowsWithStatus) c[r._status] = (c[r._status] ?? 0) + 1;
    return c;
  }, [rowsWithStatus, rows.length]);

  return (
    <div className="flex flex-col gap-4">

      {/* Search + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#BBC4AA" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search client…"
            className="h-9 w-[220px] rounded-[10px] border-[0.5px] border-hairline-strong bg-white pl-8 pr-3 text-[13px] text-olive shadow-sm placeholder:text-olive-faint focus:outline-none focus:ring-1 focus:ring-sage/30"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
              statusFilter === "all"
                ? "bg-olive text-cream"
                : "bg-white border border-hairline text-olive/60 hover:bg-cream-deep"
            )}
          >
            All <span className="tabular-nums opacity-60">{counts.all}</span>
          </button>
          {ALL_STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors border",
                  active ? "border-transparent" : "border-hairline bg-white hover:bg-cream-deep"
                )}
                style={active ? { background: cfg.bg, color: cfg.fg, borderColor: "transparent" } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                {cfg.label}
                {counts[s] !== undefined && (
                  <span className="tabular-nums opacity-60">{counts[s]}</span>
                )}
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-[12px] tabular-nums text-olive/40">
          {table.getFilteredRowModel().rows.length} client{table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-hairline bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-hairline bg-cream-deep/60">
                  {hg.headers.map((h) => {
                    const sort = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        className="cursor-pointer whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/40 select-none"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === "asc" ? (
                            <ArrowUp size={10} strokeWidth={2} className="text-sage" />
                          ) : sort === "desc" ? (
                            <ArrowDown size={10} strokeWidth={2} className="text-sage" />
                          ) : h.column.columnDef.header ? (
                            <ChevronsUpDown size={10} strokeWidth={1.8} className="opacity-30" />
                          ) : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr
                  key={r.id}
                  className="group/row border-b border-hairline last:border-b-0 transition-colors hover:bg-cream-deep/30"
                >
                  {r.getVisibleCells().map((c) => (
                    <td key={c.id} className="whitespace-nowrap px-4 py-3">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-[13px] text-olive/40">
                    No clients match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] text-olive/40">
          <span>Rows per page</span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-[8px] border border-hairline bg-white px-2 py-1 text-[12px] text-olive focus:outline-none"
          >
            {[10, 15, 25, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            className="rounded-[8px] border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-olive disabled:opacity-30 hover:bg-cream-deep transition-colors"
          >
            Previous
          </button>
          {/* Page pills */}
          {Array.from({ length: Math.min(table.getPageCount(), 5) }, (_, i) => {
            const page = table.getState().pagination.pageIndex;
            const total = table.getPageCount();
            // Show window around current page
            let start = Math.max(0, page - 2);
            const end = Math.min(total, start + 5);
            start = Math.max(0, end - 5);
            const p = start + i;
            if (p >= total) return null;
            return (
              <button
                key={p}
                onClick={() => table.setPageIndex(p)}
                className={cn(
                  "min-w-[32px] rounded-[8px] border px-2 py-1.5 text-[12px] font-medium transition-colors",
                  p === page
                    ? "border-sage bg-sage text-cream"
                    : "border-hairline bg-white text-olive hover:bg-cream-deep"
                )}
              >
                {p + 1}
              </button>
            );
          })}
          <button
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            className="rounded-[8px] border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-olive disabled:opacity-30 hover:bg-cream-deep transition-colors"
          >
            Next
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Pills ────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ClientStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

function TierPill({ tier }: { tier: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    friend:       { bg: "rgba(62,62,49,0.06)",   fg: "#3E3E31" },
    insider:      { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    inner_circle: { bg: "rgba(184,148,90,0.10)",  fg: "#B8945A" },
  };
  const { bg, fg } = palette[tier] ?? palette.friend!;
  const label =
    tier === "inner_circle" ? "Inner Circle" : tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}
