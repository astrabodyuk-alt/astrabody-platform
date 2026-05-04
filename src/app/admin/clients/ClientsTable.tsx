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
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatGBP, formatPoints } from "@/lib/utils";

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

export function ClientsTable({ rows }: { rows: Row[] }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "last_booking_at", desc: true },
  ]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/admin/clients/${row.original.id}`}
            className="text-[14px] font-medium tracking-snug text-olive underline-offset-2 hover:underline"
          >
            {row.original.full_name || "—"}
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="truncate text-[13px] tracking-snug text-olive-soft">
            {row.original.email || "—"}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums text-olive-soft">
            {row.original.phone || "—"}
          </span>
        ),
      },
      {
        accessorKey: "tier",
        header: "Tier",
        cell: ({ row }) => <TierPill tier={row.original.tier} />,
      },
      {
        accessorKey: "lifetime_points",
        header: "Lifetime points",
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums text-olive">
            {formatPoints(row.original.lifetime_points)}
          </span>
        ),
      },
      {
        accessorKey: "total_spend_pence",
        header: "Total spend",
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums text-olive">
            {formatGBP(row.original.total_spend_pence)}
          </span>
        ),
      },
      {
        accessorKey: "last_booking_at",
        header: "Last booking",
        cell: ({ row }) => (
          <span className="text-[13px] text-olive-soft">
            {row.original.last_booking_at
              ? new Date(row.original.last_booking_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, value) => {
      const v = String(value).toLowerCase();
      return [
        row.original.full_name,
        row.original.email,
        row.original.phone,
      ].some((s) => s.toLowerCase().includes(v));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search by name, email or phone"
          className="h-11 w-full max-w-[360px] rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
        />
        <span className="text-[12px] tabular-nums text-olive-soft">
          {table.getFilteredRowModel().rows.length} match
          {table.getFilteredRowModel().rows.length === 1 ? "" : "es"}
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b-[0.5px] border-hairline">
                  {hg.headers.map((h) => {
                    const sort = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        className="cursor-pointer whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === "asc" ? (
                            <ArrowUp size={12} strokeWidth={1.6} />
                          ) : sort === "desc" ? (
                            <ArrowDown size={12} strokeWidth={1.6} />
                          ) : (
                            <ChevronsUpDown size={12} strokeWidth={1.6} className="opacity-40" />
                          )}
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
                  className="border-b-[0.5px] border-hairline last:border-b-0 hover:bg-cream-deep/40"
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
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-[13px] tracking-snug text-olive-soft"
                  >
                    No clients match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Pagination table={table} />
    </div>
  );
}

function TierPill({ tier }: { tier: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    friend: { bg: "rgba(62,62,49,0.06)", fg: "#3E3E31" },
    insider: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    inner_circle: { bg: "rgba(184,148,90,0.10)", fg: "#B8945A" },
  };
  const { bg, fg } = palette[tier] ?? palette.friend;
  const label =
    tier === "inner_circle" ? "Inner Circle" : tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function Pagination<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  const page = table.getState().pagination.pageIndex + 1;
  const total = table.getPageCount();
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-olive-soft">
        Page <span className={cn("tabular-nums text-olive")}>{page}</span> of{" "}
        <span className="tabular-nums text-olive">{Math.max(total, 1)}</span>
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
