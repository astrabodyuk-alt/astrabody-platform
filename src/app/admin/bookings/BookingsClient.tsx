"use client";

import { useEffect, useState, useTransition } from "react";
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
import { cn, formatGBP } from "@/lib/utils";
import {
  cancelBooking,
  markBookingCompleted,
  updateBookingSoldBy,
  markBookingNoShow,
  getNoShowDefault,
} from "./actions";
import type { BookingRow } from "./page";
import {
  IntakeResponseSection,
  type IntakeResponseEmbed,
} from "./IntakeResponseSection";

interface PolicyPropShape {
  enabled: boolean;
  noshowChargePct: number;
  lateCancelChargePct: number;
  lateCancelCutoffHours: number;
}

export function BookingsClient({
  days,
  selectedYmd,
  bookings,
  focusId,
  tenantStaff,
  canEditSoldBy,
  policy,
}: {
  days: Array<{ ymd: string; label: string; weekday: string }>;
  selectedYmd: string;
  bookings: BookingRow[];
  focusId: string | null;
  tenantStaff: Array<{ id: string; display_name: string }>;
  canEditSoldBy: boolean;
  policy: PolicyPropShape;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // If we landed with ?focus=<bookingId>, open the Sheet for that row.
  const initialOpen = focusId ? bookings.find((b) => b.id === focusId) ?? null : null;
  const [active, setActive] = useState<BookingRow | null>(initialOpen);

  useEffect(() => {
    if (focusId) {
      const match = bookings.find((b) => b.id === focusId) ?? null;
      setActive(match);
    }
  }, [focusId, bookings]);

  return (
    <>
      {/* Day strip (horizontal scroll) */}
      <div className="-mx-2 overflow-x-auto px-2 pb-1">
        <div className="flex min-w-max gap-2">
          {days.map((d) => {
            const isActive = d.ymd === selectedYmd;
            return (
              <Link
                key={d.ymd}
                href={`/admin/bookings?date=${d.ymd}`}
                className={cn(
                  "flex w-[64px] flex-col items-center justify-center gap-1 rounded-full border-[0.5px] py-3 transition-colors duration-200 ease-ios",
                  isActive
                    ? "border-transparent bg-sage text-cream"
                    : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-label-caps",
                    isActive ? "text-cream/85" : "text-olive-soft"
                  )}
                >
                  {d.weekday}
                </span>
                <span className="font-serif text-[22px] font-medium leading-none tabular-nums">
                  {d.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {bookings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {bookings.map((b) => (
            <BookingItem key={b.id} booking={b} onSelect={() => setActive(b)} />
          ))}
        </ul>
      )}

      <Sheet
        open={!!active}
        onOpenChange={(open) => {
          if (!open) {
            setActive(null);
            // Strip ?focus= from URL on close
            if (focusId) router.replace(`/admin/bookings?date=${selectedYmd}`);
          }
        }}
      >
        <SheetContent>
          {active && (
            <BookingDetail
              booking={active}
              busy={pending}
              tenantStaff={tenantStaff}
              canEditSoldBy={canEditSoldBy}
              policy={policy}
              onComplete={() =>
                startTransition(async () => {
                  const r = await markBookingCompleted(active.id);
                  if (r.ok) {
                    setActive(null);
                    router.refresh();
                  }
                })
              }
              onChangeSoldBy={(newStaffId) =>
                startTransition(async () => {
                  const r = await updateBookingSoldBy(active.id, newStaffId);
                  if (r.ok) router.refresh();
                })
              }
              onAfterMutation={() => {
                setActive(null);
                router.refresh();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function BookingItem({
  booking,
  onSelect,
}: {
  booking: BookingRow;
  onSelect: () => void;
}) {
  const service = pickFirst<{ name: string; duration_min: number }>(booking.services);
  const staff = pickFirst<{ display_name: string }>(booking.staff);
  const soldBy = pickFirst<{ display_name: string }>(booking.sold_by);
  const resource = pickFirst<{ name: string }>(booking.service_resources);
  const client = pickFirst<{ full_name: string | null; email: string | null; phone: string | null }>(
    booking.clients
  );
  const time = new Date(booking.starts_at)
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();

  const soldByLabel = soldBy?.display_name?.split(" ")[0] ?? null;

  return (
    <li>
      <Card
        interactive
        onClick={onSelect}
        role="button"
        tabIndex={0}
        className="flex items-center gap-4 p-4"
      >
        <span className="w-16 flex-shrink-0 font-serif text-[18px] font-medium tabular-nums text-olive">
          {time}
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-medium tracking-snug text-olive">
            {service?.name ?? "Session"}
            {resource?.name ? (
              <span className="text-olive-soft"> · {resource.name}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
            {client?.full_name ?? client?.email ?? "—"} · {staff?.display_name ?? "staff"}
            {service?.duration_min ? ` · ${service.duration_min} min` : ""}
          </p>
          {soldByLabel && (
            <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
              Sold by {soldByLabel}
            </p>
          )}
        </div>
        <StatusPill status={booking.status} />
      </Card>
    </li>
  );
}

type Modal =
  | { kind: "none" }
  | { kind: "cancel"; reason: string; isLate: boolean; lateFeePence: number }
  | { kind: "noshow"; reason: string; amountPounds: string; loading: boolean; defaultPence: number; pricePence: number; noshowPct: number; hasCardOnFile: boolean };

function BookingDetail({
  booking,
  busy,
  tenantStaff,
  canEditSoldBy,
  policy,
  onComplete,
  onChangeSoldBy,
  onAfterMutation,
}: {
  booking: BookingRow;
  busy: boolean;
  tenantStaff: Array<{ id: string; display_name: string }>;
  canEditSoldBy: boolean;
  policy: PolicyPropShape;
  onComplete: () => void;
  onChangeSoldBy: (newStaffId: string) => void;
  onAfterMutation: () => void;
}) {
  const router = useRouter();
  const [chargePending, startCharge] = useTransition();
  const [chargeError, setChargeError] = useState<string | null>(null);

  const service = pickFirst<{ name: string; duration_min: number }>(booking.services);
  const staff = pickFirst<{ display_name: string }>(booking.staff);
  const soldBy = pickFirst<{ display_name: string }>(booking.sold_by);
  const resource = pickFirst<{ name: string }>(booking.service_resources);
  const client = pickFirst<{
    full_name: string | null;
    email: string | null;
    phone: string | null;
    default_payment_method_id: string | null;
    card_brand: string | null;
    card_last4: string | null;
  }>(booking.clients);
  const hasCardOnFile = !!client?.default_payment_method_id;

  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const timeRange = `${formatTime(startsAt)} – ${formatTime(endsAt)}`;
  const dateLong = startsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });

  const [modal, setModal] = useState<Modal>({ kind: "none" });

  const canCancel = booking.status === "pending" || booking.status === "confirmed";
  const canComplete = booking.status === "confirmed";
  const canNoShow = booking.status === "confirmed";

  const isLateNow =
    policy.enabled &&
    startsAt.getTime() - Date.now() < policy.lateCancelCutoffHours * 3_600_000;
  const lateFeePence = Math.round(
    (booking.price_pence * policy.lateCancelChargePct) / 100
  );

  function openCancel() {
    setChargeError(null);
    setModal({
      kind: "cancel",
      reason: "",
      isLate: isLateNow && hasCardOnFile,
      lateFeePence: isLateNow && hasCardOnFile ? lateFeePence : 0,
    });
  }

  function openNoShow() {
    setChargeError(null);
    setModal({
      kind: "noshow",
      reason: "",
      amountPounds: "",
      loading: true,
      defaultPence: 0,
      pricePence: 0,
      noshowPct: policy.noshowChargePct,
      hasCardOnFile,
    });
    // Lazy-load the auto-computed default from the server so the modal
    // pre-fills without making the parent fetch this for every booking.
    void getNoShowDefault(booking.id).then((r) => {
      if (!r.ok) {
        setChargeError(r.error);
        setModal({ kind: "none" });
        return;
      }
      setModal({
        kind: "noshow",
        reason: "",
        amountPounds: (r.defaultPence / 100).toFixed(2),
        loading: false,
        defaultPence: r.defaultPence,
        pricePence: r.pricePence,
        noshowPct: r.noshowPct,
        hasCardOnFile: r.hasCardOnFile,
      });
    });
  }

  function performCancel(charge: boolean) {
    if (modal.kind !== "cancel") return;
    const reason = modal.reason;
    setChargeError(null);
    startCharge(async () => {
      const r = await cancelBooking(booking.id, reason, charge);
      if (!r.ok) {
        setChargeError(r.error);
        return;
      }
      onAfterMutation();
    });
  }

  function performNoShow() {
    if (modal.kind !== "noshow") return;
    const pounds = Number(modal.amountPounds);
    if (!Number.isFinite(pounds) || pounds <= 0) {
      setChargeError("Amount must be a positive number");
      return;
    }
    setChargeError(null);
    startCharge(async () => {
      const r = await markBookingNoShow({
        bookingId: booking.id,
        amountPence: Math.round(pounds * 100),
        reason: modal.reason,
      });
      if (!r.ok) {
        setChargeError(r.error);
        return;
      }
      router.refresh();
      setModal({ kind: "none" });
      onAfterMutation();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{service?.name ?? "Session"}</SheetTitle>
        <SheetDescription>
          {dateLong} · {timeRange}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <Row label="Client" value={client?.full_name ?? "—"} />
        <Row label="Email" value={client?.email ?? "—"} />
        <Row label="Phone" value={client?.phone ?? "—"} />
        <Row label="Staff" value={staff?.display_name ?? "—"} />
        {canEditSoldBy ? (
          <SoldByRow
            current={booking.sold_by_staff_id}
            tenantStaff={tenantStaff}
            disabled={busy || chargePending}
            onChange={onChangeSoldBy}
          />
        ) : (
          <Row label="Sold by" value={soldBy?.display_name ?? "—"} />
        )}
        {resource?.name && (
          <Row label="Resource" value={resource.name} />
        )}
        <Row label="Status" value={booking.status.replace("_", " ")} />

        <IntakeResponseSection
          bookingId={booking.id}
          embed={pickFirstIntake(booking.intake_responses)}
        />

        <Row label="Price" value={formatGBP(booking.price_pence)} />
        <Row
          label="Deposit"
          value={
            booking.deposit_pence === 0
              ? "—"
              : `${formatGBP(booking.deposit_pence)} ${booking.deposit_paid ? "(paid)" : "(unpaid)"}`
          }
        />
        <Row
          label="Card on file"
          value={
            hasCardOnFile
              ? `${cardBrandLabel(client!.card_brand)} •• ${client!.card_last4}`
              : "no card"
          }
        />
        {booking.status === "no_show" && booking.noshow_charged_amount_pence ? (
          <Row
            label="No-show charged"
            value={formatGBP(booking.noshow_charged_amount_pence)}
          />
        ) : null}
        {booking.notes && <Row label="Notes" value={booking.notes} />}
      </div>

      {chargeError && (
        <p className="mt-3 rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {chargeError}
        </p>
      )}

      <SheetFooter>
        {canComplete && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onComplete}
            disabled={busy || chargePending}
          >
            {busy ? "Saving" : "Mark completed"}
          </Button>
        )}
        {canNoShow && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openNoShow}
            disabled={busy || chargePending}
            className="text-olive"
          >
            Mark no-show
          </Button>
        )}
        {canCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCancel}
            disabled={busy || chargePending}
            className="text-olive-soft hover:text-destructive"
          >
            Cancel booking
          </Button>
        )}
      </SheetFooter>

      {modal.kind === "cancel" && (
        <CancelModal
          modal={modal}
          pending={chargePending}
          policy={policy}
          hasCardOnFile={hasCardOnFile}
          onChange={(reason) =>
            setModal({ ...modal, reason })
          }
          onClose={() => setModal({ kind: "none" })}
          onSubmit={performCancel}
        />
      )}
      {modal.kind === "noshow" && (
        <NoShowModal
          modal={modal}
          pending={chargePending}
          clientFirstName={firstName(client?.full_name)}
          onChange={(patch) => setModal({ ...modal, ...patch })}
          onClose={() => setModal({ kind: "none" })}
          onSubmit={performNoShow}
        />
      )}
    </>
  );
}

function CancelModal({
  modal,
  pending,
  policy,
  hasCardOnFile,
  onChange,
  onClose,
  onSubmit,
}: {
  modal: Extract<Modal, { kind: "cancel" }>;
  pending: boolean;
  policy: PolicyPropShape;
  hasCardOnFile: boolean;
  onChange: (reason: string) => void;
  onClose: () => void;
  onSubmit: (charge: boolean) => void;
}) {
  return (
    <ModalShell title="Cancel this booking" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {modal.isLate ? (
          <p className="text-[14px] tracking-snug text-olive">
            This is a late cancellation (within {policy.lateCancelCutoffHours}h).
            Charge {policy.lateCancelChargePct}% ({formatGBP(modal.lateFeePence)})?
          </p>
        ) : (
          <p className="text-[14px] tracking-snug text-olive">
            {policy.enabled
              ? "Outside the cutoff, so no charge applies."
              : "Cancellation policy is disabled."}
            {!hasCardOnFile && policy.enabled
              ? " (No card on file either way.)"
              : ""}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Reason (optional, saved to notes)
          </span>
          <input
            type="text"
            value={modal.reason}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Sick, rescheduled, no answer…"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {modal.isLate && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onSubmit(true)}
              disabled={pending}
            >
              {pending ? "Charging" : `Charge late fee & cancel`}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSubmit(false)}
            disabled={pending}
            className="text-olive-soft"
          >
            {modal.isLate ? "Cancel without charge" : "Cancel booking"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function NoShowModal({
  modal,
  pending,
  clientFirstName,
  onChange,
  onClose,
  onSubmit,
}: {
  modal: Extract<Modal, { kind: "noshow" }>;
  pending: boolean;
  clientFirstName: string;
  onChange: (patch: Partial<Extract<Modal, { kind: "noshow" }>>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const amountPence = Math.round(Number(modal.amountPounds || 0) * 100);
  return (
    <ModalShell
      title={`Charge ${clientFirstName}'s card on file?`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {modal.loading ? (
          <p className="text-[13px] tracking-snug text-olive-soft">Loading…</p>
        ) : (
          <>
            {!modal.hasCardOnFile && (
              <p className="rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                No card on file. Add one from the client&rsquo;s portal first.
              </p>
            )}
            <p className="text-[14px] tracking-snug text-olive">
              Default: {formatGBP(modal.defaultPence)} ({modal.noshowPct}% of {formatGBP(modal.pricePence)}). You can override below.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
                Amount to charge (£)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={modal.amountPounds}
                onChange={(e) => onChange({ amountPounds: e.target.value })}
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[16px] tabular-nums text-olive shadow-1"
              />
              <span className="text-[11px] tracking-snug text-olive-faint">
                Charging {formatGBP(amountPence)} now.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
                Reason (optional, saved to notes)
              </span>
              <input
                type="text"
                value={modal.reason}
                onChange={(e) => onChange({ reason: e.target.value })}
                placeholder="No answer at the door, etc."
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
              />
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onSubmit}
                disabled={pending || !modal.hasCardOnFile || amountPence <= 0}
              >
                {pending ? "Charging" : `Charge & mark no-show`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={pending}
                className="text-olive-soft"
              >
                Back
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-olive/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[16px] bg-white p-5 shadow-1">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-[20px] font-medium tracking-tight text-olive">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[14px] text-olive-soft hover:text-olive"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function cardBrandLabel(brand: string | null | undefined): string {
  if (!brand) return "card";
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "Amex",
  };
  return map[brand.toLowerCase()] ?? brand;
}

function firstName(full: string | null | undefined): string {
  if (!full) return "this client";
  return full.trim().split(/\s+/)[0] || "this client";
}

function SoldByRow({
  current,
  tenantStaff,
  disabled,
  onChange,
}: {
  current: string | null;
  tenantStaff: Array<{ id: string; display_name: string }>;
  disabled: boolean;
  onChange: (newStaffId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        Sold by
      </span>
      <select
        value={current ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v !== current) onChange(v);
        }}
        className="h-9 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-2 text-[13px] tracking-snug text-olive shadow-1 disabled:opacity-50"
      >
        {!current && <option value="">—</option>}
        {tenantStaff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      <span className="text-[14px] tracking-snug text-olive">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    confirmed: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    pending: { bg: "rgba(184,148,90,0.10)", fg: "#B8945A" },
    completed: { bg: "rgba(117,133,100,0.16)", fg: "#3E3E31" },
    cancelled: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
    no_show: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
  };
  const { bg, fg } = palette[status] ?? { bg: "rgba(62,62,49,0.06)", fg: "#3E3E31" };
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function formatTime(d: Date): string {
  return d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function pickFirstIntake(value: unknown): IntakeResponseEmbed | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as IntakeResponseEmbed) ?? null;
  return value as IntakeResponseEmbed;
}
