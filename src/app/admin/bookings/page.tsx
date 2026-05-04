import { fromZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCancellationPolicy } from "@/lib/finance/policy";
import { BookingsClient } from "./BookingsClient";
import { WaitlistTab, type AdminWaitlistRow } from "./WaitlistTab";

/**
 * /admin/bookings — list view of bookings filtered by day.
 *
 * V1: simple list with day-pill filter (default = today). Click a row
 * → Sheet with details + cancel + mark-completed.
 *
 * V2 TODO: swap to FullCalendar week/month grid with drag-to-reschedule.
 * Custom day grid was not built to keep this turn focused.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; focus?: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  const params = await searchParams;
  const tz = "Europe/London";
  const now = new Date();
  const todayYmd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const dayYmd =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayYmd;
  const dayStart = fromZonedTime(`${dayYmd}T00:00:00`, tz);
  const dayEnd = fromZonedTime(`${dayYmd}T23:59:59.999`, tz);

  const supabase = await createServerSupabase();
  const [bookingsResult, staffResult, policy, waitlistResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, price_pence, deposit_pence, deposit_paid, notes, " +
          "staff_id, sold_by_staff_id, noshow_charged_amount_pence, " +
          "services (name, duration_min), staff:staff_id (display_name), " +
          "sold_by:sold_by_staff_id (display_name), " +
          "service_resources:resource_id (name), " +
          "clients (full_name, email, phone, default_payment_method_id, card_brand, card_last4), " +
          "intake_responses (id, submitted_at, expires_at, answers, intake_forms (name, fields))"
      )
      .eq("tenant_id", ctx.tenantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("staff")
      .select("id, display_name")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    getCancellationPolicy(ctx.tenantId),
    supabase
      .from("waitlist_entries")
      .select(
        "id, preferred_date, preferred_window, notified_at, expires_at, created_at, " +
          "staff_id, service_id, " +
          "clients (full_name, email, phone), " +
          "services (name), " +
          "staff:staff_id (display_name)"
      )
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const bookings = (bookingsResult.data ?? []) as unknown as Array<BookingRow>;
  const tenantStaff = (staffResult.data ?? []) as Array<{
    id: string;
    display_name: string;
  }>;

  const waitlistRows = ((waitlistResult.data ?? []) as unknown as Array<{
    id: string;
    preferred_date: string;
    preferred_window: "morning" | "afternoon" | "evening" | "any";
    notified_at: string | null;
    expires_at: string;
    created_at: string;
    staff_id: string | null;
    service_id: string;
    clients:
      | { full_name: string | null; email: string | null; phone: string | null }
      | { full_name: string | null; email: string | null; phone: string | null }[]
      | null;
    services: { name: string } | { name: string }[] | null;
    staff: { display_name: string } | { display_name: string }[] | null;
  }>).map<AdminWaitlistRow>((r) => {
    const cli = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const svc = Array.isArray(r.services) ? r.services[0] : r.services;
    const stf = Array.isArray(r.staff) ? r.staff[0] : r.staff;
    return {
      id: r.id,
      client_name: cli?.full_name ?? "—",
      client_email: cli?.email ?? null,
      client_phone: cli?.phone ?? null,
      service_name: svc?.name ?? "—",
      staff_name: stf?.display_name ?? null,
      preferred_date: r.preferred_date,
      preferred_window: r.preferred_window,
      notified_at: r.notified_at,
      expires_at: r.expires_at,
      created_at: r.created_at,
    };
  });

  // Build the 14-day strip starting today.
  const days: Array<{ ymd: string; label: string; weekday: string }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    days.push({
      ymd: d.toLocaleDateString("en-CA", { timeZone: tz }),
      label: d.toLocaleDateString("en-GB", { day: "numeric", timeZone: tz }),
      weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Bookings
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {format(dayStart, "EEEE, d MMMM")} · {bookings.length} booking{bookings.length === 1 ? "" : "s"}
        </p>
      </header>

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="waitlist">
            Waitlist
            {waitlistRows.filter((r) => !r.notified_at).length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sage/20 px-1.5 text-[10px] font-medium tabular-nums text-sage-deep">
                {waitlistRows.filter((r) => !r.notified_at).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="day">
          <BookingsClient
            days={days}
            selectedYmd={dayYmd}
            bookings={bookings}
            focusId={params.focus ?? null}
            tenantStaff={tenantStaff}
            canEditSoldBy={ctx.isOwnerOrAdmin}
            policy={{
              enabled: policy.enabled,
              noshowChargePct: policy.noshowChargePct,
              lateCancelChargePct: policy.lateCancelChargePct,
              lateCancelCutoffHours: policy.lateCancelCutoffHours,
            }}
          />

          {bookings.length === 0 && (
            <Card className="mt-4 p-5">
              <p className="text-[13px] tracking-snug text-olive-soft">
                Nothing booked that day.
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="waitlist">
          <WaitlistTab
            rows={waitlistRows}
            isOwnerOrAdmin={ctx.isOwnerOrAdmin}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  price_pence: number;
  deposit_pence: number;
  deposit_paid: boolean;
  notes: string | null;
  staff_id: string;
  sold_by_staff_id: string | null;
  noshow_charged_amount_pence: number | null;
  services: unknown;
  staff: unknown;
  sold_by: unknown;
  service_resources: unknown;
  clients: unknown;
  intake_responses: unknown;
}
