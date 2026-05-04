import { type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateBookingIcs } from "@/lib/booking/ics";

/**
 * GET /api/bookings/[id]/ics → text/calendar download for the confirmed booking.
 * Uses the user-scoped Supabase client so RLS keeps each client to their own
 * bookings (bookings_client_self policy).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, services (name), staff!bookings_staff_id_fkey (display_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !booking) {
    return new Response("not found", { status: 404 });
  }

  const service = pickFirst<{ name: string }>(
    (booking as { services: unknown }).services
  );
  const staff = pickFirst<{ display_name: string }>(
    (booking as { staff: unknown }).staff
  );

  const ics = generateBookingIcs({
    bookingId: id,
    startsAt: new Date(booking.starts_at as string),
    endsAt: new Date(booking.ends_at as string),
    serviceName: service?.name ?? "Astrabody session",
    staffName: staff?.display_name ?? null,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="astrabody-${id}.ics"`,
    },
  });
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
