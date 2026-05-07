import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  getActiveServicesForCurrentTenant,
  getRedemptionForBooking,
} from "@/lib/portal/booking-queries";
import { getCurrentClient } from "@/lib/portal/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { getActiveFlashSlotsForPortal } from "@/lib/flash-slots/queries";

// ── Service card visuals ────────────────────────────────────────────────────
const SERVICE_CARD_MAP: {
  keywords: string[];
  photo: string;
  tagline: string;
}[] = [
  {
    keywords: ["ems", "sculpt", "suprasculpt"],
    photo: "/images/ems-sculpting.jpg",
    tagline: "Tone muscle · reduce fat",
  },
  {
    keywords: ["fat", "freez", "cryo"],
    photo: "/images/fat-freezing.jpg",
    tagline: "Permanent fat reduction",
  },
  {
    keywords: ["infra", "bike"],
    photo: "/images/infrabike-card.jpg",
    tagline: "Infrared detox · calorie burn",
  },
  {
    keywords: ["laser", "hair"],
    photo: "/images/laser-hair.jpg",
    tagline: "All skin tones · long-lasting",
  },
];

function getServiceVisuals(name: string) {
  const lower = name.toLowerCase();
  const match = SERVICE_CARD_MAP.find((m) =>
    m.keywords.some((kw) => lower.includes(kw))
  );
  return match ?? { photo: null, tagline: null };
}

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
/** Maps ?filter= key → keywords that match against service names (lowercase). */
const FILTER_KEYWORDS: Record<string, string[]> = {
  ems:   ["ems", "sculpt", "suprasculpt"],
  fat:   ["fat", "freez", "cryo"],
  bike:  ["infra", "bike"],
  laser: ["laser", "hair"],
};

function matchesFilter(serviceName: string, filter: string): boolean {
  const keywords = FILTER_KEYWORDS[filter];
  if (!keywords) return true; // unknown filter → show all
  const lower = serviceName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ reward?: string; ref?: string; filter?: string }>;
}) {
  const { reward, filter } = await searchParams;
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

  // getCurrentClient is React.cache — no extra round-trip.
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  // Run services fetch, "your usual" lookup, and flash slots in parallel.
  let services;
  let yourUsual = null;
  let flashSlots: Awaited<ReturnType<typeof getActiveFlashSlotsForPortal>> = [];
  try {
    [services, yourUsual, flashSlots] = await Promise.all([
      getActiveServicesForCurrentTenant(),
      pickYourUsual(me.id),
      getActiveFlashSlotsForPortal().catch(() => []),
    ]);
  } catch {
    redirect("/portal/login");
  }

  // Build a map serviceId → flash slot for quick lookup in the card grid
  const flashByService = new Map(flashSlots.map((f) => [f.serviceId, f]));

  // If a category filter is present, narrow the list.
  // If exactly one service matches, skip the picker entirely.
  if (filter) {
    const filtered = services.filter((s) => matchesFilter(s.name, filter));
    if (filtered.length === 1) {
      redirect(`/portal/book/${filtered[0]!.id}`);
    }
    if (filtered.length > 0) {
      services = filtered;
    }
    // If nothing matched (e.g. service removed from DB), fall through and show all.
  }

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

      <div className="mt-4 grid grid-cols-2 gap-3">
        {services.map((svc) => {
          const { photo, tagline } = getServiceVisuals(svc.name);
          const flash = flashByService.get(svc.id);
          const flashHref = flash
            ? `/portal/book/${svc.id}?flash=${flash.id}${flash.staffId ? `&staff=${flash.staffId}` : ""}`
            : `/portal/book/${svc.id}`;
          return (
            <Link
              key={svc.id}
              href={flashHref}
              className="block focus-visible:outline-none"
            >
              <div
                className="group relative overflow-hidden rounded-[20px] transition-transform active:scale-[0.97]"
                style={{ height: 200 }}
              >
                {/* Full-bleed photo */}
                {photo && (
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url('${photo}')` }}
                  />
                )}

                {/* Dark gradient overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(14,22,10,0.88) 0%, rgba(14,22,10,0.35) 50%, transparent 80%)",
                  }}
                />

                {/* Flash badge (top-right) */}
                {flash && (
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-olive shadow-sm">
                    ⚡ {formatGBP(flash.flashPricePence)}
                  </div>
                )}

                {/* Text content pinned to bottom */}
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <h3 className="font-serif text-[15px] font-medium leading-snug tracking-tight text-white">
                    {svc.name}
                  </h3>
                  {tagline && (
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.10em] text-white/55">
                      {tagline}
                    </p>
                  )}
                  {/* Glassmorphism pill */}
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-[10px] px-3 py-2 transition-colors group-hover:bg-white/20"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  >
                    <span className="text-[11px] font-semibold tracking-wide text-white">
                      {svc.duration_min} min ·{" "}
                      {flash ? (
                        <>
                          <span className="line-through opacity-60">{formatGBP(svc.price_pence)}</span>
                          {" "}{formatGBP(flash.flashPricePence)}
                        </>
                      ) : (
                        svc.price_pence === 0 ? "Free" : formatGBP(svc.price_pence)
                      )}
                    </span>
                    <ChevronRight size={11} strokeWidth={2.5} className="text-white/70" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
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
