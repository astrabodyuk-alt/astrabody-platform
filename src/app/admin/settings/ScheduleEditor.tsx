"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, X, AlertTriangle, CalendarDays, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addStaffTimeOff,
  addStudioClosure,
  removeStaffTimeOff,
  removeStudioClosure,
} from "@/lib/scheduling/schedule-actions";
import { decideBankHoliday } from "@/lib/scheduling/bank-holiday-actions";
import { CommsProposalBar } from "@/components/admin/CommsProposalBar";

export interface ClosureRow {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  is_all_day: boolean;
  partial_start: string | null;
  partial_end: string | null;
  service_id: string | null;
  service_name: string | null;
  affected_bookings: number;
}

export interface StaffTimeOffRow {
  id: string;
  staff_id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  is_all_day: boolean;
  partial_start: string | null;
  partial_end: string | null;
}

export interface StaffOption {
  id: string;
  display_name: string;
  role: string | null;
  days_off_year: number;
}

export interface ServiceOption {
  id: string;
  name: string;
}

export interface BankHolidayDecisionRow {
  id: string;
  date: string;
  name: string;
  decision: "pending" | "closed" | "open";
  client_email_sent_at: string | null;
}

interface Props {
  closures: ClosureRow[];
  timeOff: StaffTimeOffRow[];
  staff: StaffOption[];
  services: ServiceOption[];
  bankHolidays: BankHolidayDecisionRow[];
  isOwnerOrAdmin: boolean;
  currentStaffId: string | null;
}

const REASONS = ["Annual leave", "Sick", "Training", "Personal", "Other"];

export function ScheduleEditor({
  closures,
  timeOff,
  staff,
  services,
  bankHolidays,
  isOwnerOrAdmin,
  currentStaffId,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <BankHolidaysSection
        bankHolidays={bankHolidays}
        services={services}
        readOnly={!isOwnerOrAdmin}
      />
      <ClosuresSection
        closures={closures}
        services={services}
        readOnly={!isOwnerOrAdmin}
      />
      <StaffAvailabilitySection
        timeOff={timeOff}
        staff={staff}
        isOwnerOrAdmin={isOwnerOrAdmin}
        currentStaffId={currentStaffId}
      />
    </div>
  );
}

// ============================================================
// Bank holidays
// ============================================================

function BankHolidaysSection({
  bankHolidays,
  services,
  readOnly,
}: {
  bankHolidays: BankHolidayDecisionRow[];
  services: ServiceOption[];
  readOnly: boolean;
}) {
  const [activeProposal, setActiveProposal] = useState<{
    id: string;
    summary: string;
  } | null>(null);

  const upcoming = bankHolidays.slice(0, 8);

  return (
    <Card className="p-5">
      <div>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4 text-sage" />
          <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
            Bank holidays
          </h2>
        </div>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Decide whether you&apos;ll close on each upcoming UK bank holiday.
          We&apos;ll remind you two months out if you haven&apos;t chosen.
        </p>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {upcoming.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            All caught up — no upcoming bank holidays in the roster.
          </li>
        )}
        {upcoming.map((bh) => (
          <BankHolidayRow
            key={bh.id}
            bh={bh}
            readOnly={readOnly}
            onProposal={(id) =>
              setActiveProposal({
                id,
                summary: `Closed on ${bh.name} (${formatDate(bh.date)})`,
              })
            }
          />
        ))}
      </ul>

      {activeProposal && (
        <CommsProposalBar
          proposalId={activeProposal.id}
          triggerSummary={activeProposal.summary}
          defaultSegment={{ type: "all" }}
          services={services}
          onResolved={() => setActiveProposal(null)}
        />
      )}
    </Card>
  );
}

function BankHolidayRow({
  bh,
  readOnly,
  onProposal,
}: {
  bh: BankHolidayDecisionRow;
  readOnly: boolean;
  onProposal: (proposalId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const daysAway = Math.ceil(
    (new Date(`${bh.date}T00:00:00`).getTime() - Date.now()) / 86_400_000
  );

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[18px] font-medium text-olive">
            {formatDate(bh.date)}
          </span>
          <span className="text-[14px] text-olive">{bh.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] tracking-snug text-olive-soft">
          <DecisionBadge decision={bh.decision} />
          <span>· in {daysAway} days</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {bh.decision === "pending" && !readOnly && (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await decideBankHoliday({
                    decisionId: bh.id,
                    decision: "closed",
                  });
                  if (res.ok && res.proposalId) {
                    onProposal(res.proposalId);
                  }
                  router.refresh();
                })
              }
            >
              Close this day
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await decideBankHoliday({
                    decisionId: bh.id,
                    decision: "open",
                  });
                  router.refresh();
                })
              }
            >
              Stay open
            </Button>
          </>
        )}

        {bh.decision === "closed" && bh.client_email_sent_at == null && !readOnly && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sand/40 px-2.5 py-1 text-[11px] tracking-snug text-olive-soft">
            <Mail className="size-3" />
            Email pending
          </span>
        )}
      </div>
    </li>
  );
}

function DecisionBadge({
  decision,
}: {
  decision: "pending" | "closed" | "open";
}) {
  if (decision === "pending") {
    return (
      <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] tracking-snug text-olive">
        Pending
      </span>
    );
  }
  if (decision === "closed") {
    return (
      <span className="rounded-full bg-sage/20 px-2 py-0.5 text-[11px] tracking-snug text-sage-deep">
        Closed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-olive/10 px-2 py-0.5 text-[11px] tracking-snug text-olive-soft">
      Open
    </span>
  );
}

// ============================================================
// Studio closures
// ============================================================

function ClosuresSection({
  closures,
  services,
  readOnly,
}: {
  closures: ClosureRow[];
  services: ServiceOption[];
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<{
    id: string;
    summary: string;
  } | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const closureDates = useMemo(() => {
    const set = new Set<string>();
    for (const c of closures) {
      const start = new Date(`${c.starts_on}T00:00:00`);
      const end = new Date(`${c.ends_on}T00:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(d.toLocaleDateString("en-CA"));
      }
    }
    return set;
  }, [closures]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
            Studio closures
          </h2>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            Bank holidays and one-off closures. Bookings can&apos;t be made on
            these dates.
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
            <Plus className="size-4" />
            Add closure
          </Button>
        )}
      </div>

      <MiniMonthGrid
        month={viewMonth}
        onPrev={() =>
          setViewMonth(
            (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
          )
        }
        onNext={() =>
          setViewMonth(
            (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
          )
        }
        highlight={closureDates}
      />

      <ul className="mt-5 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {closures.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            No upcoming closures.
          </li>
        )}
        {closures.map((c) => (
          <ClosureRowItem key={c.id} closure={c} readOnly={readOnly} />
        ))}
      </ul>

      {open && (
        <ClosureSheet
          services={services}
          onClose={() => setOpen(false)}
          onProposal={(id, summary) => setActiveProposal({ id, summary })}
        />
      )}

      {activeProposal && (
        <CommsProposalBar
          proposalId={activeProposal.id}
          triggerSummary={activeProposal.summary}
          defaultSegment={{ type: "all" }}
          services={services}
          onResolved={() => setActiveProposal(null)}
        />
      )}
    </Card>
  );
}

function ClosureRowItem({
  closure: c,
  readOnly,
}: {
  closure: ClosureRow;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const dateLabel =
    c.starts_on === c.ends_on
      ? formatDate(c.starts_on)
      : `${formatDate(c.starts_on)} – ${formatDate(c.ends_on)}`;
  const timeLabel = c.is_all_day
    ? "All day"
    : `${(c.partial_start ?? "").slice(0, 5)}–${(c.partial_end ?? "").slice(0, 5)}`;
  const scopeLabel = c.service_name ? `Service: ${c.service_name}` : "Whole studio";

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-olive">{dateLabel}</div>
        <div className="text-[12px] tracking-snug text-olive-soft">
          {timeLabel} · {scopeLabel}
          {c.reason && ` · ${c.reason}`}
        </div>
        {c.affected_bookings > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[12px] text-terracotta">
            <AlertTriangle className="size-3.5" />
            {c.affected_bookings} existing booking
            {c.affected_bookings === 1 ? "" : "s"} on this day
          </div>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          aria-label="Remove closure"
          onClick={() =>
            startTransition(async () => {
              await removeStudioClosure(c.id);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md p-2 text-olive-soft transition-colors hover:bg-sage/5 hover:text-olive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}

function ClosureSheet({
  services,
  onClose,
  onProposal,
}: {
  services: ServiceOption[];
  onClose: () => void;
  onProposal: (proposalId: string, summary: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [isAllDay, setIsAllDay] = useState(true);
  const [partialStart, setPartialStart] = useState("09:00");
  const [partialEnd, setPartialEnd] = useState("17:00");
  const [reason, setReason] = useState("");
  const [serviceId, setServiceId] = useState<string>("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-olive/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-cream p-5 shadow-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-[18px] font-medium text-olive">
            Add closure
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                Start date
              </span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                End date
              </span>
              <input
                type="date"
                value={endsOn}
                min={startsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[14px] text-olive">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="size-4 rounded border-olive/15 text-sage focus:ring-sage"
            />
            All day
          </label>

          {!isAllDay && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] tracking-snug text-olive-soft">
                  Closed from
                </span>
                <input
                  type="time"
                  value={partialStart}
                  onChange={(e) => setPartialStart(e.target.value)}
                  className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] tracking-snug text-olive-soft">
                  Closed until
                </span>
                <input
                  type="time"
                  value={partialEnd}
                  onChange={(e) => setPartialEnd(e.target.value)}
                  className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
                />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Scope
            </span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            >
              <option value="">Entire studio</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} only
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Reason (optional)
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Christmas Day, Equipment maintenance"
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>

          {error && (
            <p className="text-[13px] text-destructive">{error}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await addStudioClosure({
                    startsOn,
                    endsOn,
                    isAllDay,
                    partialStart: isAllDay ? null : partialStart,
                    partialEnd: isAllDay ? null : partialEnd,
                    reason: reason || null,
                    serviceId: serviceId || null,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  if (res.proposalId) {
                    const dateLabel =
                      startsOn === endsOn
                        ? formatDate(startsOn)
                        : `${formatDate(startsOn)} – ${formatDate(endsOn)}`;
                    const summary = reason
                      ? `Closed on ${reason} (${dateLabel})`
                      : `Studio closed on ${dateLabel}`;
                    onProposal(res.proposalId, summary);
                  }
                  router.refresh();
                  onClose();
                })
              }
            >
              {isPending ? "Adding…" : "Apply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Staff availability
// ============================================================

function StaffAvailabilitySection({
  timeOff,
  staff,
  isOwnerOrAdmin,
  currentStaffId,
}: {
  timeOff: StaffTimeOffRow[];
  staff: StaffOption[];
  isOwnerOrAdmin: boolean;
  currentStaffId: string | null;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);

  const visibleStaff = isOwnerOrAdmin
    ? staff
    : staff.filter((s) => s.id === currentStaffId);

  return (
    <Card className="p-5">
      <div>
        <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
          Staff availability
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Holidays and time off. Practitioners disappear from the booking
          page during these dates.
        </p>
      </div>

      <ul className="mt-5 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {visibleStaff.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            No staff to manage.
          </li>
        )}
        {visibleStaff.map((s) => {
          const upcoming = timeOff
            .filter((t) => t.staff_id === s.id)
            .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
          const canManage = isOwnerOrAdmin || s.id === currentStaffId;
          return (
            <li key={s.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-olive">
                    {s.display_name}
                  </div>
                  <div className="text-[12px] tracking-snug text-olive-soft">
                    {s.role ? `${s.role} · ` : ""}
                    {s.days_off_year} day{s.days_off_year === 1 ? "" : "s"} off
                    this year
                  </div>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenFor(s.id)}
                    className="gap-1.5"
                  >
                    <Plus className="size-4" />
                    Add time off
                  </Button>
                )}
              </div>

              {upcoming.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 pl-1">
                  {upcoming.map((t) => (
                    <TimeOffRowItem
                      key={t.id}
                      timeOff={t}
                      canRemove={canManage}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {openFor && (
        <TimeOffSheet
          staffId={openFor}
          staffName={
            staff.find((s) => s.id === openFor)?.display_name ?? "Staff"
          }
          onClose={() => setOpenFor(null)}
        />
      )}
    </Card>
  );
}

function TimeOffRowItem({
  timeOff: t,
  canRemove,
}: {
  timeOff: StaffTimeOffRow;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const dateLabel =
    t.starts_on === t.ends_on
      ? formatDate(t.starts_on)
      : `${formatDate(t.starts_on)} – ${formatDate(t.ends_on)}`;
  const timeLabel = t.is_all_day
    ? "All day"
    : `${(t.partial_start ?? "").slice(0, 5)}–${(t.partial_end ?? "").slice(0, 5)}`;

  return (
    <li className="flex items-center justify-between gap-3 text-[13px] tracking-snug">
      <div className="text-olive-soft">
        {!t.is_all_day && (
          <span
            aria-hidden
            className="mr-1 inline-block size-1.5 rounded-full bg-terracotta align-middle"
          />
        )}
        {dateLabel} · {timeLabel}
        {t.reason && ` · ${t.reason}`}
      </div>
      {canRemove && (
        <button
          type="button"
          aria-label="Remove time off"
          onClick={() =>
            startTransition(async () => {
              await removeStaffTimeOff(t.id);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-md p-1 text-olive-soft transition-colors hover:bg-sage/5 hover:text-olive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function TimeOffSheet({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string;
  staffName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [isAllDay, setIsAllDay] = useState(true);
  const [partialStart, setPartialStart] = useState("09:00");
  const [partialEnd, setPartialEnd] = useState("13:00");
  const [reason, setReason] = useState(REASONS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-olive/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-cream p-5 shadow-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-[18px] font-medium text-olive">
            {staffName} — time off
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                Start date
              </span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                End date
              </span>
              <input
                type="date"
                value={endsOn}
                min={startsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[14px] text-olive">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="size-4 rounded border-olive/15 text-sage focus:ring-sage"
            />
            All day
          </label>

          {!isAllDay && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] tracking-snug text-olive-soft">
                  Off from
                </span>
                <input
                  type="time"
                  value={partialStart}
                  onChange={(e) => setPartialStart(e.target.value)}
                  className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] tracking-snug text-olive-soft">
                  Off until
                </span>
                <input
                  type="time"
                  value={partialEnd}
                  onChange={(e) => setPartialEnd(e.target.value)}
                  className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
                />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Reason
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="text-[13px] text-destructive">{error}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await addStaffTimeOff({
                    staffId,
                    startsOn,
                    endsOn,
                    isAllDay,
                    partialStart: isAllDay ? null : partialStart,
                    partialEnd: isAllDay ? null : partialEnd,
                    reason,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  router.refresh();
                  onClose();
                })
              }
            >
              {isPending ? "Adding…" : "Apply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Mini calendar grid
// ============================================================

function MiniMonthGrid({
  month,
  onPrev,
  onNext,
  highlight,
}: {
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  highlight: Set<string>;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: Array<{ ymd: string; day: number } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, m, d);
    cells.push({ ymd: dt.toLocaleDateString("en-CA"), day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const todayYmd = new Date().toLocaleDateString("en-CA");
  const monthLabel = month.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mt-4 rounded-xl border border-olive/10 bg-sand/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={onPrev}
          className="rounded-md px-2 py-1 text-[14px] text-olive-soft hover:bg-sage/5 hover:text-olive"
        >
          ‹
        </button>
        <div className="text-[13px] font-medium tracking-snug text-olive">
          {monthLabel}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={onNext}
          className="rounded-md px-2 py-1 text-[14px] text-olive-soft hover:bg-sage/5 hover:text-olive"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-snug text-olive-soft">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} aria-hidden className="h-8" />;
          const isClosed = highlight.has(c.ymd);
          const isToday = c.ymd === todayYmd;
          return (
            <div
              key={i}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-[12px] tracking-snug tabular-nums",
                isClosed
                  ? "bg-sand text-olive"
                  : "bg-cream text-olive-soft",
                isToday && "ring-1 ring-sage"
              )}
            >
              {c.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// utils
// ============================================================

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function formatDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
