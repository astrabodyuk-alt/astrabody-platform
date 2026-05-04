"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rescheduleBookingByClient } from "./actions";

const TZ = "Europe/London";
const DAYS = 14;

interface DayPill {
  iso: string;
  weekday: string;
  dayNum: string;
}

interface AvailabilityResponse {
  slots: string[];
  staffId: string | null;
  staffName: string | null;
}

/**
 * Mini slot picker for the reschedule page. Same data source
 * (/api/availability) as the booking flow but locked to the original
 * service / staff / resource — the client can't change those during a
 * reschedule, only the date and time. Submitting opens a confirmation
 * modal before firing the server action.
 */
export function RescheduleClient({
  bookingId,
  serviceId,
  staffId,
  resourceId,
  currentStartsAtIso,
}: {
  bookingId: string;
  serviceId: string;
  staffId: string;
  resourceId: string | null;
  currentStartsAtIso: string;
}) {
  const router = useRouter();
  const days = useMemo(() => buildDays(DAYS), []);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      setSelectedTime(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    const qs = new URLSearchParams({
      serviceId,
      date: selectedDate,
      staffId,
    });
    if (resourceId) qs.set("resourceId", resourceId);
    fetch(`/api/availability?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as AvailabilityResponse;
      })
      .then((data) => {
        if (cancelled) return;
        // Filter out the booking's current time so the user doesn't see
        // it as a "free" option (it is, but moving to it is a no-op).
        const filtered = (data.slots ?? []).filter(
          (s) => s !== currentStartsAtIso
        );
        setSlots(filtered);
        setSelectedTime(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
        setLoading(false);
        setFetchError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, selectedDate, staffId, resourceId, currentStartsAtIso]);

  function handleConfirm() {
    if (!selectedTime) return;
    setError(null);
    startTransition(async () => {
      const r = await rescheduleBookingByClient({
        bookingId,
        newStartsAtIso: selectedTime,
      });
      if (!r.ok) {
        setError(r.error);
        setConfirmOpen(false);
        return;
      }
      router.push(`/portal/booking/${bookingId}/confirmed?moved=1`);
    });
  }

  return (
    <>
      <DayStrip
        days={days}
        selected={selectedDate}
        onSelect={setSelectedDate}
      />

      <div className="mt-6 px-2">
        {!selectedDate && (
          <p className="text-[13px] tracking-snug text-olive-soft">
            Pick a day to see what&rsquo;s available.
          </p>
        )}
        {selectedDate && loading && (
          <p className="text-[13px] tracking-snug text-olive-soft">
            Looking for slots
          </p>
        )}
        {selectedDate && !loading && fetchError && (
          <p className="text-[13px] tracking-snug text-olive-soft">
            Couldn&rsquo;t load slots. Try another day or refresh.
          </p>
        )}
        {selectedDate && !loading && !fetchError && slots.length === 0 && (
          <p className="text-[13px] tracking-snug text-olive-soft">
            No slots that day. Try another.
          </p>
        )}
        {!loading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((iso) => (
              <TimePill
                key={iso}
                iso={iso}
                selected={selectedTime === iso}
                onSelect={() => setSelectedTime(iso)}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 px-2 text-[12px] text-destructive">{error}</p>
      )}

      <div className="fixed inset-x-0 bottom-[100px] z-30 flex justify-center px-4">
        <div className="w-full max-w-[448px]">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={!selectedTime || pending}
            onClick={() => setConfirmOpen(true)}
          >
            {pending ? "Moving" : "Move to this slot"}
          </Button>
        </div>
      </div>

      {confirmOpen && selectedTime && (
        <ConfirmModal
          newStartsAtIso={selectedTime}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function ConfirmModal({
  newStartsAtIso,
  pending,
  onConfirm,
  onCancel,
}: {
  newStartsAtIso: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const friendly = formatLong(newStartsAtIso);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-olive/30 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-[420px] p-5">
        <h3 className="font-serif text-[20px] font-medium tracking-tight text-olive">
          Move to {friendly}?
        </h3>
        <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
          We&rsquo;ll update your calendar and send a quick confirmation
          email.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
            className="text-olive-soft"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Moving" : "Confirm"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: DayPill[];
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-2">
        {days.map((d) => {
          const active = selected === d.iso;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => onSelect(d.iso)}
              className={cn(
                "ax-tap flex w-[64px] flex-col items-center justify-center gap-1 rounded-full border-[0.5px] py-3 transition-colors duration-200 ease-ios",
                active
                  ? "border-transparent bg-sage text-cream"
                  : "border-hairline-strong bg-white text-olive"
              )}
              aria-pressed={active}
            >
              <span className="text-[11px] font-medium uppercase tracking-label-caps">
                {d.weekday}
              </span>
              <span className="font-serif text-[18px] font-medium leading-none tabular-nums">
                {d.dayNum}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimePill({
  iso,
  selected,
  onSelect,
}: {
  iso: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = new Date(iso)
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    })
    .replace(/\s+/g, "")
    .toLowerCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "ax-tap rounded-md border-[0.5px] px-3 py-2 text-[13px] font-medium tabular-nums tracking-snug transition-colors duration-200 ease-ios",
        selected
          ? "border-transparent bg-sage text-cream"
          : "border-hairline-strong bg-white text-olive"
      )}
    >
      {label}
    </button>
  );
}

function buildDays(n: number): DayPill[] {
  const out: DayPill[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = d.toLocaleDateString("en-CA", { timeZone: TZ });
    const weekday = d.toLocaleDateString("en-GB", {
      weekday: "short",
      timeZone: TZ,
    });
    const dayNum = d.toLocaleDateString("en-GB", {
      day: "numeric",
      timeZone: TZ,
    });
    out.push({ iso, weekday, dayNum });
  }
  return out;
}

function formatLong(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
  const time = d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TZ,
    })
    .replace(/\s+/g, "")
    .toLowerCase();
  return `${date} at ${time}`;
}
