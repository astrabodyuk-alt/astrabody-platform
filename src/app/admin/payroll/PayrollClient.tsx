"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { CommissionsTable, type CommissionRow } from "../me/CommissionsTable";
import { cn, formatGBP } from "@/lib/utils";
import { markPendingAsPaidForStaff } from "./actions";

export type PayrollScope = "this_month" | "last_month" | "all";

export interface StaffAggregate {
  staffId: string;
  displayName: string;
  photoUrl: string | null;
  ratePct: number;
  pendingPence: number;
  paidPence: number;
  voidPence: number;
  totalPence: number;
  rowCount: number;
  rows: CommissionRow[];
}

const SCOPES: Array<{ id: PayrollScope; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All time" },
];

export function PayrollClient({
  scope,
  aggregates,
  pendingTotal,
  paidTotal,
}: {
  scope: PayrollScope;
  aggregates: StaffAggregate[];
  pendingTotal: number;
  paidTotal: number;
}) {
  const [open, setOpen] = useState<StaffAggregate | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {SCOPES.map((s) => (
          <Link
            key={s.id}
            href={`/admin/payroll?scope=${s.id}`}
            className={cn(
              "rounded-full border-[0.5px] px-3 py-1.5 text-[12px] font-medium tracking-snug transition-colors duration-200 ease-ios",
              s.id === scope
                ? "border-transparent bg-sage text-cream"
                : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
            )}
            aria-current={s.id === scope ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Pending payout" value={formatGBP(pendingTotal)} />
        <Stat label="Paid in this scope" value={formatGBP(paidTotal)} />
      </div>

      <ul className="flex flex-col gap-2">
        {aggregates.map((a) => (
          <li key={a.staffId}>
            <Card
              interactive
              role="button"
              tabIndex={0}
              onClick={() => setOpen(a)}
              className="flex items-center gap-4 p-4"
            >
              <Avatar name={a.displayName} photoUrl={a.photoUrl} />
              <div className="flex-1">
                <p className="text-[14px] font-medium tracking-snug text-olive">
                  {a.displayName}
                </p>
                <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                  {a.rowCount} {a.rowCount === 1 ? "sale" : "sales"} &middot;{" "}
                  {a.ratePct.toFixed(1)}% rate
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-serif text-[20px] font-medium tabular-nums text-olive">
                  {formatGBP(a.pendingPence)}
                </span>
                <span className="text-[11px] uppercase tracking-label-caps text-olive-soft">
                  pending
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Sheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
      >
        <SheetContent>
          {open && (
            <PayrollDrawer
              key={open.staffId}
              aggregate={open}
              onClose={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PayrollDrawer({
  aggregate,
  onClose,
}: {
  aggregate: StaffAggregate;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidNotice, setPaidNotice] = useState<string | null>(null);

  const canPay = aggregate.pendingPence > 0;

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const r = await markPendingAsPaidForStaff(aggregate.staffId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPaidNotice(
        `${r.count} ${r.count === 1 ? "row" : "rows"} marked paid · ${formatGBP(r.totalPence)}`
      );
      setConfirming(false);
      router.refresh();
      // Close after a short pause so the notice is seen.
      setTimeout(() => onClose(), 700);
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{aggregate.displayName}</SheetTitle>
        <SheetDescription>
          {aggregate.ratePct.toFixed(1)}% commission rate &middot;{" "}
          {aggregate.rowCount} {aggregate.rowCount === 1 ? "row" : "rows"} in
          scope
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Pending" value={formatGBP(aggregate.pendingPence)} />
          <MiniStat label="Paid" value={formatGBP(aggregate.paidPence)} />
        </div>

        <div className="-mx-1">
          <CommissionsTable rows={aggregate.rows} />
        </div>

        {error && <p className="text-[12px] text-destructive">{error}</p>}
        {paidNotice && (
          <p className="text-[12px] text-sage-deep">{paidNotice}</p>
        )}
      </div>

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
              onClick={handlePay}
              disabled={pending}
            >
              {pending
                ? "Marking paid"
                : `Confirm ${formatGBP(aggregate.pendingPence)}`}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!canPay || pending}
          >
            Mark all pending as paid
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[32px] font-medium leading-none tracking-tightest tabular-nums text-olive">
        {value}
      </p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-hairline bg-cream-deep px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-1 font-serif text-[20px] font-medium leading-none tabular-nums text-olive">
        {value}
      </p>
    </div>
  );
}

function Avatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={44}
        height={44}
        className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-cream"
      style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      aria-hidden
    >
      {initials || "✨"}
    </div>
  );
}
