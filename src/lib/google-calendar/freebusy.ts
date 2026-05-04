import "server-only";
import { google } from "googleapis";
import { getOAuth2ClientForStaff } from "@/lib/google-calendar/oauth";

/**
 * Returns busy intervals for `staffId` between [start, end].
 *
 * Best-effort:
 *   - No active integration → []
 *   - Google API error → log, return [] (don't break /api/availability)
 *
 * Wired by Prompt 4's /api/availability route. Real implementation as
 * of Prompt 8.
 */
export async function getFreeBusyForStaff(
  staffId: string,
  start: Date,
  end: Date
): Promise<Array<{ start: string; end: string }>> {
  const ctx = await getOAuth2ClientForStaff(staffId);
  if (!ctx) return [];

  try {
    const calendar = google.calendar({ version: "v3", auth: ctx.client });
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: ctx.calendarId }],
      },
    });
    const busy = res.data.calendars?.[ctx.calendarId]?.busy ?? [];
    return busy
      .map((b) => ({
        start: b.start ?? "",
        end: b.end ?? "",
      }))
      .filter((b) => !!b.start && !!b.end);
  } catch (err) {
    console.warn(
      "[gcal/freebusy] query failed for staff",
      staffId,
      "— degrading to empty busy set:",
      (err as Error).message
    );
    return [];
  }
}
