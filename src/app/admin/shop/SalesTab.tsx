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
import { resendDownloadLink } from "./actions";

export interface SaleRow {
  id: string;
  amountPence: number;
  status: "pending" | "paid" | "refunded";
  createdAt: string;
  deliveredAt: string | null;
  buyerEmail: string;
  productId: string | null;
  productName: string;
  clientId: string | null;
  clientName: string | null;
}

export function SalesTab({ sales }: { sales: SaleRow[] }) {
  const [active, setActive] = useState<SaleRow | null>(null);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b-[0.5px] border-hairline">
              <Th>Date</Th>
              <Th>Product</Th>
              <Th>Buyer</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr
                key={s.id}
                onClick={() => setActive(s)}
                className="cursor-pointer border-b-[0.5px] border-hairline last:border-b-0 hover:bg-cream-deep/40"
              >
                <Td>{formatDate(s.createdAt)}</Td>
                <Td>{s.productName}</Td>
                <Td>
                  {s.clientId && s.clientName ? (
                    <Link
                      href={`/admin/clients/${s.clientId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.clientName}
                    </Link>
                  ) : (
                    s.buyerEmail
                  )}
                </Td>
                <Td align="right" strong>
                  {formatGBP(s.amountPence)}
                </Td>
                <Td>
                  <StatusPill status={s.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Sheet
        open={!!active}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <SheetContent>
          {active && (
            <SaleDrawer
              key={active.id}
              sale={active}
              onClose={() => setActive(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SaleDrawer({
  sale,
  onClose,
}: {
  sale: SaleRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const r = await resendDownloadLink(sale.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResent(true);
      router.refresh();
      setTimeout(() => setResent(false), 4000);
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{sale.productName}</SheetTitle>
        <SheetDescription>
          {formatDate(sale.createdAt)} · {sale.buyerEmail}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <DetailRow label="Amount" value={formatGBP(sale.amountPence)} />
        <DetailRow label="Status" value={sale.status} />
        <DetailRow
          label="Delivered at"
          value={sale.deliveredAt ? formatDateTime(sale.deliveredAt) : "—"}
        />
        {sale.clientId && (
          <DetailRow
            label="Client"
            value={
              <Link
                href={`/admin/clients/${sale.clientId}`}
                className="underline-offset-2 hover:underline"
                onClick={onClose}
              >
                {sale.clientName ?? sale.buyerEmail}
              </Link>
            }
          />
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

      <SheetFooter>
        {sale.status === "paid" && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleResend}
            disabled={pending}
          >
            {pending
              ? "Sending"
              : resent
                ? "Sent ✓"
                : "Resend download link"}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function StatusPill({ status }: { status: SaleRow["status"] }) {
  const palette: Record<SaleRow["status"], { bg: string; fg: string }> = {
    pending: { bg: "rgba(184,148,90,0.10)", fg: "#B8945A" },
    paid: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    refunded: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function formatDateTime(iso: string): string {
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
