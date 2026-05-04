import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendIntakeLinkOut } from "@/lib/forms/actions";

/**
 * GET /api/cron/intake-form-reminders
 *
 * Bearer-auth-protected. Hourly. Picks up intake_responses rows whose
 * booking starts in 23–25h and that haven't been submitted (or
 * reminded) yet, sends the WhatsApp + email, sets reminder_sent_at.
 *
 * TODO: post-deploy, add to vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/intake-form-reminders", "schedule": "5 * * * *" }
 *   ]
 * }
 * Hourly at 5 minutes past.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const now = Date.now();
  const lower = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const upper = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("intake_responses")
    .select(
      "id, token, tenant_id, " +
        "bookings:booking_id (starts_at, clients (full_name, email, phone, id), services (name)), " +
        "tenants:tenant_id (name, slug, subdomain, custom_domain)"
    )
    .is("submitted_at", null)
    .is("reminder_sent_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .gte("bookings.starts_at", lower)
    .lte("bookings.starts_at", upper)
    .limit(500);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  type Joined = {
    id: string;
    token: string;
    tenant_id: string;
    bookings:
      | {
          starts_at: string;
          clients:
            | {
                id: string;
                full_name: string | null;
                email: string | null;
                phone: string | null;
              }
            | {
                id: string;
                full_name: string | null;
                email: string | null;
                phone: string | null;
              }[]
            | null;
          services: { name: string } | { name: string }[] | null;
        }
      | null;
    tenants:
      | {
          name: string | null;
          slug: string | null;
          subdomain: string | null;
          custom_domain: string | null;
        }
      | {
          name: string | null;
          slug: string | null;
          subdomain: string | null;
          custom_domain: string | null;
        }[]
      | null;
  };

  let sent = 0;
  for (const row of (data ?? []) as unknown as Joined[]) {
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    if (!booking) continue;
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const client = Array.isArray(booking.clients)
      ? booking.clients[0]
      : booking.clients;
    const service = Array.isArray(booking.services)
      ? booking.services[0]
      : booking.services;

    await sendIntakeLinkOut({
      token: row.token,
      tenantName: tenant?.name ?? "the studio",
      portalHost: tenant ?? null,
      serviceName: service?.name ?? null,
      startsAtIso: booking.starts_at,
      clientName: client?.full_name ?? null,
      clientEmail: client?.email ?? null,
      clientPhone: client?.phone ?? null,
      tenantId: row.tenant_id,
      clientId: client?.id ?? null,
    });

    await admin
      .from("intake_responses")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
