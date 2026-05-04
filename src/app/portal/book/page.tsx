import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  getActiveServicesForCurrentTenant,
  getRedemptionForBooking,
} from "@/lib/portal/booking-queries";
import { getCurrentClient } from "@/lib/portal/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

/**
 * Step 1 of 3 — pick a service.
 *
 * Apple-canon. One Card per active bookable service for the current tenant.
 * 1 column on mobile, 2 columns ≥ 480px.
 *
 * If `?reward=<redemptionId>` is present (the user just redeemed a
 * free_service reward on /portal/me), we skip the picker and jump
 * straight into the slot-picker for the bound service, carrying the
 * reward query param through.
 */
export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ reward?: string; ref?: string }>;
}) {
  const { reward } = await searchParams;
  // The ?ref=<code> query string is captured by middleware (which sets
  // the 7-day astra_ref cookie). The page itself doesn't read or write
  // the cookie — server components can't mutate cookies during render.

  if (reward) {
    const redemption = await getRedemptionForBooking(reward);
    if (redemption?.available && redemption.serviceId) {
      redirect(
        `/portal/book/${redemption.serviceId}?reward=${encodeURIComponent(reward)}`
      );
    }
    // If the redemption is missing / used / wrong-kind, fall through
    // to the standard picker so the user isn't stuck.
  }

  let services;
  try {
    services = await getActiveServicesForCurrentTenant();
  } catch {
    redirect("/portal/login");
  }

  // "Your usual" — surfaces the most-booked service when the client has
  // 2+ completed bookings for it, with the last staff they used.
  const me = await getCurrentClient().catch(() => null);
  const yourUsual = me ? await pickYourUsual(me.id) : null;

  return (
    <div className="px-4 pt-4">
      <header className="mb-2 px-2 py-3">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Step 1 of 4
        </p>
        <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Book a session
        </h1>
        <p className="mt-2 text-[15px] tracking-snug text-olive-soft">
          Pick what you&rsquo;d like. We&rsquo;ll find a time next.
        </p>
      </header>

      {yourUsual && (
        <Link
          href={`/portal/book/${yourUsual.serviceId}?source=book_again${yourUsual.staffId ? `&staff=${yourUsual.staffId}` : ""}`}
          className="mt-4 block focus-visible:outline-none"
        >
          <Card
            interactive
            className="flex items-center justify-between gap-3 border-hairline p-5"
          >
            <div className="min-w-0">
              <h2 className="font-serif text-[18px] font-medium tracking-tight text-olive">
                Your usual
              </h2>
              <p className="mt-0.5 text-[13px] tracking-snug text-olive">
                {yourUsual.serviceName} · {yourUsual.durationMin} min ·{" "}
                {formatGBP(yourUsual.pricePence)}
              </p>
              <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                {yourUsual.lastStaffName
                  ? `Last with ${yourUsual.lastStaffName}`
                  : "Last booked"}
                {" · "}
                {yourUsual.lastBookedRelative}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-sage/30 px-3 py-1.5 text-[13px] font-medium text-sage-deep">
              Book again <ArrowRight className="size-3.5" />
            </span>
          </Card>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        {services.map((svc) => (
          <Link
            key={svc.id}
            href={`/portal/book/${svc.id}`}
            className="block focus-visible:outline-none"
          >
            <Card interactive className="flex h-full flex-col gap-2 p-5">
              <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
                {svc.name}
              </h3>
              <p className="text-[13px] tracking-snug text-olive-soft">
                {svc.duration_min} min ·{" "}
                {svc.price_pence === 0 ? "Free" : formatGBP(svc.price_pence)}
              </p>
              {svc.deposit_pence > 0 && (
                <span className="self-start rounded-full bg-cream-deep px-3 py-1 text-[12px] font-medium text-olive">
                  {formatGBP(svc.deposit_pence)} deposit
                </span>
              )}
            </Card>
          </Link>
        ))}
      </div>

      {services.length === 0 && (
        <Card className="mt-6 p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No services available right now.
          </p>
        </Card>
      )}
    </div>
  );
}

interface YourUsual {
  serviceId: string;
  serviceName: string;
  durationMin: number;
  pricePence: number;
  staffId: string | null;
  lastStaffName: string | null;
  lastBookedRelative: string;
}

async function pickYourUsual(clientId: string): Promise<YourUsual | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, service_id, staff_id, starts_at, status, " +
        "services (name, duration_min, price_pence, is_bookable), " +
        "staff:staff_id (display_name, is_active)"
    )
    .eq("client_id", clientId)
    .eq("status", "completed")
    .order("starts_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string;
    service_id: string;
    staff_id: string | null;
    starts_at: string;
    services:
      | {
          name: string;
          duration_min: number;
          price_pence: number;
          is_bookable: boolean;
        }
      | {
          name: string;
          duration_min: number;
          price_pence: number;
          is_bookable: boolean;
        }[]
      | null;
    staff:
      | { display_name: string; is_active: boolean }
      | { display_name: string; is_active: boolean }[]
      | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => {
    const svc = Array.isArray(r.services) ? r.services[0] : r.services;
    return !!svc && svc.is_bookable;
  });
  if (rows.length === 0) return null;

  // Tally completed bookings per service. "Your usual" = the service
  // with at least two completed bookings, most recent first.
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.service_id, (tally.get(r.service_id) ?? 0) + 1);
  const topId = [...tally.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topId) return null;

  const last = rows.find((r) => r.service_id === topId);
  if (!last) return null;
  const svc = Array.isArray(last.services) ? last.services[0] : last.services;
  const stf = Array.isArray(last.staff) ? last.staff[0] : last.staff;
  if (!svc) return null;

  return {
    serviceId: last.service_id,
    serviceName: svc.name,
    durationMin: svc.duration_min,
    pricePence: svc.price_pence,
    staffId: stf?.is_active ? last.staff_id : null,
    lastStaffName: stf?.display_name ?? null,
    lastBookedRelative: `${formatDistanceToNowStrict(
      new Date(last.starts_at)
    )} ago`,
  };
}
