import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { pointsForPrice } from "@/lib/loyalty/constants";
import { formatPoints } from "@/lib/utils";

/**
 * Confirmation page. Apple canon — back inside the 480px portal column.
 *
 * Displays the upcoming-session card pattern matching /portal home, plus
 * a sage line promising loyalty points after the session, plus two
 * actions: download .ics + back to home.
 *
 * Note: lives at /portal/booking/[bookingId]/confirmed (not
 * /portal/book/[id]/confirmed) so the dynamic segment doesn't clash with
 * /portal/book/[serviceId] (different entity, different URL).
 */
export default async function BookingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ moved?: string }>;
}) {
  const { bookingId } = await params;
  const { moved } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: bookingRaw, error } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, price_pence, tenant_id, " +
        "services (name, duration_min), " +
        "staff!bookings_staff_id_fkey (display_name), " +
        "service_resources:resource_id (name)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  const booking = bookingRaw as unknown as
    | {
        id: string;
        starts_at: string;
        ends_at: string;
        status: string;
        price_pence: number;
        tenant_id: string;
        services: unknown;
        staff: unknown;
        service_resources: unknown;
      }
    | null;

  if (error || !booking) notFound();

  const service = pickFirst<{ name: string; duration_min: number }>(
    booking.services
  );
  const staff = pickFirst<{ display_name: string }>(booking.staff);
  const resource = pickFirst<{ name: string }>(booking.service_resources);

  // Cutoff awareness for the Reschedule button.
  let canReschedule = false;
  if (booking.tenant_id && booking.status === "confirmed") {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("reschedule_cutoff_hours")
      .eq("id", booking.tenant_id)
      .maybeSingle();
    const cutoffHours =
      (tenant?.reschedule_cutoff_hours as number | undefined) ?? 1;
    canReschedule =
      new Date(booking.starts_at).getTime() - Date.now() >=
      cutoffHours * 3_600_000;
  }

  const startsAt = new Date(booking.starts_at);
  const dateLong = startsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const timeShort = startsAt
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();

  const dayNum = startsAt
    .toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" });
  const monthShort = startsAt
    .toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" })
    .toUpperCase();

  const points = pointsForPrice(booking.price_pence ?? 0);

  // Build Google Calendar "Add event" URL — opens GCal with the session
  // pre-filled so the client can save it to her own calendar in one tap.
  // Falls back to /ics download for non-Google users via the secondary link.
  const endsAt = new Date(booking.ends_at);
  const toGCalStamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const gcalUrl = new URL("https://www.google.com/calendar/render");
  gcalUrl.searchParams.set("action", "TEMPLATE");
  gcalUrl.searchParams.set(
    "text",
    `${service?.name ?? "Astrabody session"} · Astrabody`
  );
  gcalUrl.searchParams.set(
    "dates",
    `${toGCalStamp(startsAt)}/${toGCalStamp(endsAt)}`
  );
  gcalUrl.searchParams.set(
    "details",
    `Your ${service?.name ?? "Astrabody"} session with ${
      staff?.display_name ?? "the Astrabody team"
    }.`
  );
  gcalUrl.searchParams.set(
    "location",
    "Astrabody, 149 Hursley Road, Chandler's Ford, Eastleigh"
  );

  return (
    <div className="px-4 pt-12 pb-8">
      {moved === "1" && (
        <div className="mb-4 rounded-[12px] bg-sage/10 px-4 py-3 text-[13px] tracking-snug text-sage-deep">
          Moved ✓ — your new time is below.
        </div>
      )}
      <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tightest text-olive">
        You&rsquo;re booked.
      </h1>
      <p className="mt-3 text-[14px] tracking-snug text-olive-soft">
        We&rsquo;ve sent you a confirmation. See you on {dateLong} at {timeShort}.
      </p>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-4">
          <div className="flex w-14 flex-shrink-0 flex-col items-center rounded-md bg-cream-deep py-2">
            <span className="font-serif text-[28px] font-medium leading-none text-olive">
              {dayNum}
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-label-caps text-olive-soft">
              {monthShort}
            </span>
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-medium tracking-snug text-olive">
              {service?.name ?? "Astrabody session"}
              {resource?.name ? (
                <span className="text-olive-soft"> · {resource.name}</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[13px] tracking-snug text-olive-soft">
              {timeShort} with {staff?.display_name ?? "Astrabody"}
              {service?.duration_min ? ` · ${service.duration_min} min` : ""}
            </div>
          </div>
          <ChevronRight size={18} strokeWidth={1.6} className="text-olive-soft" />
        </div>
      </Card>

      {points > 0 && (
        <p className="mt-4 px-1 text-[13px] tracking-snug text-sage">
          +{formatPoints(points)} points will land in your Inner Circle balance
          after your session ✨
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="secondary" className="flex-1" asChild>
          <a
            href={gcalUrl.toString()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Google Calendar
          </a>
        </Button>
        {canReschedule && (
          <Button variant="secondary" className="flex-1" asChild>
            <Link href={`/portal/booking/${bookingId}/reschedule`}>
              Reschedule
            </Link>
          </Button>
        )}
        <Button variant="primary" className="flex-1" asChild>
          <Link href="/portal">Back to home</Link>
        </Button>
      </div>
      <p className="mt-3 text-center text-[12px] text-olive-faint">
        Apple Calendar / Outlook?{" "}
        <a
          href={`/api/bookings/${bookingId}/ics`}
          download={`astrabody-${bookingId}.ics`}
          className="underline hover:text-olive-soft"
        >
          Download .ics
        </a>
      </p>
    </div>
  );
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
