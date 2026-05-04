import "server-only";

interface IcsInput {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  staffName: string | null;
}

/**
 * Generate a minimal RFC 5545 iCalendar payload for one booking.
 * Served as text/calendar from /api/bookings/[id]/ics so the client
 * can add the event to Apple Calendar / Google Calendar / Outlook.
 */
export function generateBookingIcs({
  bookingId,
  startsAt,
  endsAt,
  serviceName,
  staffName,
}: IcsInput): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (s: string) =>
    s.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

  const description = staffName
    ? `Your ${serviceName} session with ${staffName} at Astrabody.`
    : `Your ${serviceName} session at Astrabody.`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Astrabody//Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${bookingId}@astrabody.co.uk`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(startsAt)}`,
    `DTEND:${fmt(endsAt)}`,
    `SUMMARY:${esc(serviceName)} at Astrabody`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc("149 Hursley Road, Chandler's Ford, Eastleigh")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
