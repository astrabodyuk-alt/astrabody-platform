"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinWaitlist, type WaitlistWindow } from "@/lib/waitlist/actions";

/**
 * Client subcomponent for /portal/book/[serviceId]:
 *   - Horizontal scroll strip of the next 21 days (max booking window)
 *   - 3-col grid of 30-min slots for the picked day
 *   - Sticky bottom Continue button
 *
 * Slots come from /api/availability per-day; we fetch lazily on tap.
 * V1: every day pill is tappable (no upfront "disabled" state). If a day
 * has no slots, the empty message renders. TODO: pre-fetch all 21 days
 * in parallel and dim days with no slots — small UX upgrade for later.
 */

interface DayPill {
  iso: string; // YYYY-MM-DD in tenant tz
  weekday: string; // "Mon"
  dayNum: string; // "29"
}

interface AvailabilityResponse {
  slots: string[];
  /** Optional per-slot list of free resource ids (services with resources). */
  perSlotResources?: Record<string, string[]>;
  staffId: string | null;
  staffName: string | null;
}

const TZ = "Europe/London";
const DAYS = 21;

export function SlotPicker({
  serviceId,
  serviceName,
  rewardId,
  staffId,
  staffName,
  resourceId,
  activePack,
  preferredStartHour,
  preferredEndHour,
}: {
  serviceId: string;
  serviceName: string;
  rewardId?: string | null;
  /** null = "any practitioner" (default fallback in /api/availability). */
  staffId?: string | null;
  /** Pre-selected staff display name (for the waitlist sheet). */
  staffName?: string | null;
  /**
   * Resource scope: a uuid filters availability to that specific resource;
   * "any" widens to "at least one resource free at that time"; null when
   * the service has no resources.
   */
  resourceId?: string | "any" | null;
  /**
   * The soonest-expiring active pack for THIS service, if any. Renders a
   * sage notice + toggle above the slot grid; toggle ON (default) writes
   * `?pack=<id>` into the checkout URL so the next step skips Stripe.
   */
  activePack?: {
    id: string;
    name: string;
    sessionsRemaining: number;
    sessionsTotal: number;
  } | null;
  /**
   * Client's preferred booking window (local hour, 0-23).
   * Slots that fall within this range get a subtle sage dot indicator.
   */
  preferredStartHour?: number | null;
  preferredEndHour?: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [usePack, setUsePack] = useState<boolean>(!!activePack);
  const hasPreference =
    preferredStartHour != null && preferredEndHour != null;

  function isPreferred(iso: string): boolean {
    if (!hasPreference) return false;
    const hour = parseInt(
      new Date(iso).toLocaleTimeString("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: TZ,
      }),
      10
    );
    return hour >= preferredStartHour! && hour < preferredEndHour!;
  }

  const days = useMemo(() => buildDays(DAYS), []);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

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
    });
    if (staffId) qs.set("staffId", staffId);
    // Only forward a specific resource id; "any" widens server-side
    // by omitting the param, so we let the server union resources.
    if (resourceId && resourceId !== "any") qs.set("resourceId", resourceId);
    fetch(`/api/availability?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`http ${r.status}`);
        return (await r.json()) as AvailabilityResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSlots(data.slots ?? []);
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
  }, [serviceId, selectedDate, staffId, resourceId]);

  function handleContinue() {
    if (!selectedDate || !selectedTime) return;
    startTransition(() => {
      const params = new URLSearchParams({
        date: selectedDate,
        time: selectedTime,
      });
      if (rewardId) params.set("reward", rewardId);
      if (staffId) params.set("staff", staffId);
      if (resourceId) params.set("resource", resourceId);
      if (usePack && activePack) params.set("pack", activePack.id);
      router.push(`/portal/book/${serviceId}/checkout?${params.toString()}`);
    });
  }

  return (
    <>
      {activePack && (
        <PackNotice
          pack={activePack}
          on={usePack}
          onToggle={() => setUsePack((v) => !v)}
        />
      )}

      <DayStrip days={days} selected={selectedDate} onSelect={setSelectedDate} />

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
          <div className="flex flex-col gap-2">
            <p className="text-[13px] tracking-snug text-olive-soft">
              No availability on this date.
            </p>
            {!waitlistJoined ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWaitlistOpen(true)}
                className="w-full border border-sage/30 text-sage-deep hover:bg-sage/5"
              >
                Join the waitlist — we&apos;ll message you as soon as a slot opens
              </Button>
            ) : (
              <p className="rounded-xl border border-sage/20 bg-sage/5 px-4 py-3 text-[13px] tracking-snug text-olive">
                You&apos;re on the list. We&apos;ll message you on WhatsApp if a slot opens.
              </p>
            )}
          </div>
        )}
        {!loading && slots.length > 0 && (
          <>
            {hasPreference && slots.some(isPreferred) && (
              <p className="mb-3 text-[12px] tracking-snug text-sage">
                ✦ Your preferred hours are highlighted
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {slots.map((iso) => (
                <TimePill
                  key={iso}
                  iso={iso}
                  selected={selectedTime === iso}
                  preferred={isPreferred(iso)}
                  onSelect={() => setSelectedTime(iso)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom continue. Fixed inside the 480px portal column,
          floats above the BottomNav (86px) with 14px breathing room. */}
      <div className="fixed inset-x-0 bottom-[100px] z-30 flex justify-center px-4">
        <div className="w-full max-w-[448px]">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={!selectedDate || !selectedTime || pending}
            onClick={handleContinue}
          >
            {pending ? "Loading" : "Continue to checkout"}
          </Button>
        </div>
      </div>

      {waitlistOpen && selectedDate && (
        <WaitlistSheet
          serviceId={serviceId}
          serviceName={serviceName}
          preferredDate={selectedDate}
          staffId={staffId ?? null}
          staffName={staffName ?? null}
          onClose={() => setWaitlistOpen(false)}
          onJoined={() => {
            setWaitlistJoined(true);
            setWaitlistOpen(false);
          }}
        />
      )}
    </>
  );
}

function WaitlistSheet({
  serviceId,
  serviceName,
  preferredDate,
  staffId,
  staffName,
  onClose,
  onJoined,
}: {
  serviceId: string;
  serviceName: string;
  preferredDate: string;
  staffId: string | null;
  staffName: string | null;
  onClose: () => void;
  onJoined: () => void;
}) {
  const [window, setWindow] = useState<WaitlistWindow>("any");
  const [withAnyone, setWithAnyone] = useState<boolean>(!staffId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(`${preferredDate}T00:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "long", day: "numeric", month: "long" }
  );

  async function handleConfirm(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await joinWaitlist({
      serviceId,
      preferredDate,
      preferredWindow: window,
      staffId: withAnyone ? null : staffId,
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    onJoined();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-olive/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-cream p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-[20px] font-medium leading-tight text-olive">
              Join the waitlist
            </h3>
            <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
              We&apos;ll let you know the moment a slot opens up.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="rounded-xl bg-sand/30 px-3 py-2 text-[13px] tracking-snug text-olive">
          <div className="font-medium">{serviceName}</div>
          <div className="text-olive-soft">{dateLabel}</div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <span className="text-[12px] tracking-snug text-olive-soft">
              Preferred time
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {(
                [
                  { value: "morning" as const, label: "Morning" },
                  { value: "afternoon" as const, label: "Afternoon" },
                  { value: "evening" as const, label: "Evening" },
                  { value: "any" as const, label: "Any time" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWindow(opt.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px]",
                    window === opt.value
                      ? "border-sage bg-sage text-cream font-medium"
                      : "border-olive/15 bg-cream text-olive hover:border-sage/40 hover:bg-sage/5"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {staffId && staffName && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-olive/10 bg-sand/20 px-3 py-2.5">
              <span className="text-[13px] text-olive">
                Anyone available — not just {staffName}
              </span>
              <input
                type="checkbox"
                checked={withAnyone}
                onChange={(e) => setWithAnyone(e.target.checked)}
                className="size-5 rounded border-olive/15 text-sage focus:ring-sage"
              />
            </label>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy ? "Adding…" : "Add me to the waitlist"}
            </Button>
          </div>
        </div>
      </div>
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
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-label-caps",
                  active ? "text-cream/85" : "text-olive-soft"
                )}
              >
                {d.weekday}
              </span>
              <span className="font-serif text-[22px] font-medium leading-none tabular-nums">
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
  preferred,
  onSelect,
}: {
  iso: string;
  selected: boolean;
  preferred?: boolean;
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
      className={cn(
        "ax-tap relative h-12 rounded-full border-[0.5px] text-[14px] font-medium tabular-nums transition-all duration-200 ease-ios",
        selected
          ? "border-transparent bg-sage text-cream"
          : preferred
          ? "border-sage/50 bg-sage/8 text-olive hover:bg-sage/12"
          : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
      )}
      aria-pressed={selected}
    >
      {label}
      {preferred && !selected && (
        <span
          aria-hidden
          className="absolute right-2.5 top-1.5 h-1.5 w-1.5 rounded-full bg-sage"
        />
      )}
    </button>
  );
}

function buildDays(count: number): DayPill[] {
  const out: DayPill[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
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

function PackNotice({
  pack,
  on,
  onToggle,
}: {
  pack: { id: string; name: string; sessionsRemaining: number; sessionsTotal: number };
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="mb-3 rounded-[14px] px-4 py-3"
      style={{ background: "rgba(117,133,100,0.10)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-medium tracking-snug text-sage-deep">
            You have a {pack.name}
          </p>
          <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
            {pack.sessionsRemaining} session{pack.sessionsRemaining === 1 ? "" : "s"} left.
            {on
              ? " This booking will use 1 session."
              : " You'll pay full price and save your pack for later."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Use my pack"
          onClick={onToggle}
          className={cn(
            "relative h-[31px] w-[51px] flex-shrink-0 rounded-full transition-colors duration-200 ease-ios",
            on ? "bg-sage" : "bg-[#E9E9EA]"
          )}
        >
          <span
            className={cn(
              "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-ios",
              "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]",
              on ? "translate-x-[22px]" : "translate-x-[2px]"
            )}
          />
        </button>
      </div>
    </div>
  );
}
