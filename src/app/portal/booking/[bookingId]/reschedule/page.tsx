import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getReschedulableBooking } from "./actions";
import { RescheduleClient } from "./RescheduleClient";

/**
 * /portal/booking/[bookingId]/reschedule — client-side reschedule.
 *
 * Server gate (in actions.ts) checks ownership + status='confirmed'
 * + starts_at > now() + tenant.reschedule_cutoff_hours. If any fails,
 * we render a calm one-line message rather than a 404.
 */
export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const gate = await getReschedulableBooking(bookingId);

  if (!gate.ok) {
    return (
      <div className="px-4 pt-12 pb-32">
        <Card className="p-5">
          {gate.reason === "too_late" ? (
            <p className="text-[14px] tracking-snug text-sage-deep">
              Too late to reschedule.
            </p>
          ) : (
            <>
              <p className="text-[14px] tracking-snug text-olive">
                This booking can&rsquo;t be moved.
              </p>
              <Link
                href="/portal"
                className="mt-3 inline-block text-[13px] font-medium text-sage-deep hover:underline"
              >
                ← Back
              </Link>
            </>
          )}
        </Card>
      </div>
    );
  }

  const { booking, cutoffHours } = gate;

  return (
    <div className="px-4 pt-6 pb-32">
      <header className="mb-4 px-2">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Move your session
        </p>
        <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Pick a new slot
        </h1>
        <p className="mt-2 text-[13px] tracking-snug text-olive-soft">
          Currently {formatFriendly(booking.startsAt)}. Pick something else
          below and we&rsquo;ll move it. You can move it as many times as
          you like up to {cutoffHours}h before the start.
        </p>
      </header>

      <RescheduleClient
        bookingId={booking.id}
        serviceId={booking.serviceId}
        staffId={booking.staffId}
        resourceId={booking.resourceId}
        currentStartsAtIso={booking.startsAt}
      />
    </div>
  );
}

function formatFriendly(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const time = d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();
  return `${date} at ${time}`;
}
