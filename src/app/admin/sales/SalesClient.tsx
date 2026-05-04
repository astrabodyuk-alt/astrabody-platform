"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { formatGBP } from "@/lib/utils";
import { refundPackageSale } from "./actions";

export interface SaleRow {
  id: string;
  amount_paid_pence: number;
  payment_method:
    | "cash"
    | "card_terminal"
    | "bank_transfer"
    | "stripe_online"
    | "gift"
    | "other";
  refunded: boolean;
  refunded_at: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  service_packages:
    | { name: string; price_pence: number }
    | { name: string; price_pence: number }[]
    | null;
  clients:
    | { id: string; full_name: string | null; email: string | null }
    | { id: string; full_name: string | null; email: string | null }[]
    | null;
  sold_by:
    | { id: string; display_name: string }
    | { id: string; display_name: string }[]
    | null;
  client_packages:
    | {
        id: string;
        sessions_total: number;
        sessions_remaining: number;
        status: string;
        expires_at: string;
      }
    | {
        id: string;
        sessions_total: number;
        sessions_remaining: number;
        status: string;
        expires_at: string;
      }[]
    | null;
}

const METHOD_LABELS: Record<SaleRow["payment_method"], string> = {
  cash: "Cash",
  card_terminal: "Card terminal",
  bank_transfer: "Bank transfer",
  stripe_online: "Stripe online",
  gift: "Gift",
  other: "Other",
};

export function SalesClient({
  rows,
  canRefund,
}: {
  rows: SaleRow[];
  canRefund: boolean;
}) {
  const [active, setActive] = useState<SaleRow | null>(null);

  return (
    <>
      {rows.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No pack sales yet. Hit &ldquo;New sale&rdquo; to record one.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-[0.5px] border-hairline">
                  <Th>Date</Th>
                  <Th>Client</Th>
                  <Th>Pack</Th>
                  <Th>Sold by</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id} row={r} onSelect={() => setActive(r)} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet
        open={!!active}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <SheetContent>
          {active && (
            <SaleDetail
              key={active.id}
              row={active}
              canRefund={canRefund}
              onClose={() => setActive(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Row({
  row,
  onSelect,
}: {
  row: SaleRow;
  onSelect: () => void;
}) {
  const pkg = pickFirst<{ name: string; price_pence: number }>(row.service_packages);
  const client = pickFirst<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>(row.clients);
  const soldBy = pickFirst<{ id: string; display_name: string }>(row.sold_by);
  return (
    <tr
      className="cursor-pointer border-b-[0.5px] border-hairline last:border-b-0 hover:bg-cream-deep/40"
      onClick={onSelect}
    >
      <Td>{formatDate(row.created_at)}</Td>
      <Td>{client?.full_name ?? client?.email ?? "—"}</Td>
      <Td>{pkg?.name ?? "—"}</Td>
      <Td>{soldBy?.display_name ?? "—"}</Td>
      <Td>{METHOD_LABELS[row.payment_method]}</Td>
      <Td align="right" strong>
        {formatGBP(row.amount_paid_pence)}
      </Td>
      <Td>
        <StatusPill refunded={row.refunded} />
      </Td>
    </tr>
  );
}

function SaleDetail({
  row,
  canRefund,
  onClose,
}: {
  row: SaleRow;
  canRefund: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pkg = pickFirst<{ name: string; price_pence: number }>(row.service_packages);
  const client = pickFirst<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>(row.clients);
  const soldBy = pickFirst<{ id: string; display_name: string }>(row.sold_by);
  const credit = pickFirst<{
    id: string;
    sessions_total: number;
    sessions_remaining: number;
    status: string;
    expires_at: string;
  }>(row.client_packages);

  const isDiscounted =
    pkg && row.amount_paid_pence < pkg.price_pence && !row.refunded;

  function handleRefund() {
    setError(null);
    startTransition(async () => {
      const r = await refundPackageSale(row.id, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      setTimeout(() => onClose(), 400);
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{pkg?.name ?? "Pack sale"}</SheetTitle>
        <SheetDescription>
          {formatDateLong(row.created_at)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <DetailRow
          label="Client"
          value={
            client ? (
              <Link
                href={`/admin/clients/${client.id}`}
                className="underline-offset-2 hover:underline"
              >
                {client.full_name ?? client.email ?? "—"}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <DetailRow label="Sold by" value={soldBy?.display_name ?? "—"} />
        <DetailRow label="Method" value={METHOD_LABELS[row.payment_method]} />
        <DetailRow label="Amount" value={formatGBP(row.amount_paid_pence)} />
        {pkg && (
          <DetailRow label="Catalog price" value={formatGBP(pkg.price_pence)} />
        )}
        {isDiscounted && pkg && (
          <DetailRow
            label="Discount"
            value={`−${formatGBP(pkg.price_pence - row.amount_paid_pence)}`}
          />
        )}
        {row.reference && (
          <DetailRow label="Reference" value={row.reference} />
        )}
        {credit && (
          <DetailRow
            label="Sessions"
            value={`${credit.sessions_remaining} / ${credit.sessions_total} remaining (${credit.status})`}
          />
        )}
        {row.notes && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
              Notes
            </span>
            <p className="whitespace-pre-line rounded-[12px] border-[0.5px] border-hairline bg-cream-deep px-3 py-2 text-[13px] tracking-snug text-olive">
              {row.notes}
            </p>
          </div>
        )}
        {row.refunded && (
          <p className="text-[12px] tracking-snug text-destructive">
            Refunded{row.refunded_at ? ` on ${formatDate(row.refunded_at)}` : ""}.
          </p>
        )}
      </div>

      {canRefund && !row.refunded && (
        <>
          {confirming && (
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
                Refund reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Goodwill, double charge, etc."
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
              />
            </div>
          )}
          {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
          <SheetFooter>
            {confirming ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="text-olive-soft"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleRefund}
                  disabled={pending}
                >
                  {pending ? "Refunding" : "Confirm refund"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                className="text-olive-soft hover:text-destructive"
              >
                Refund this sale
              </Button>
            )}
          </SheetFooter>
        </>
      )}
    </>
  );
}

function StatusPill({ refunded }: { refunded: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={
        refunded
          ? { background: "rgba(212,91,91,0.10)", color: "#D45B5B" }
          : { background: "rgba(117,133,100,0.10)", color: "#5C6B4E" }
      }
    >
      {refunded ? "refunded" : "active"}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      <span className="text-[14px] tracking-snug text-olive">{value}</span>
    </div>
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
        "whitespace-nowrap px-4 py-3 text-[13px] tracking-snug tabular-nums " +
        (align === "right" ? "text-right " : "") +
        (strong ? "font-medium text-olive" : "text-olive")
      }
    >
      {children}
    </td>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
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
