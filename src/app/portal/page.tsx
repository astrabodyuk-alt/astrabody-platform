import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  ChevronRight,
  ArrowRight,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import {
  getCurrentClient,
  getLoyaltyAccount,
  getNextBooking,
  type NextBookingView,
  type LoyaltyView,
} from "@/lib/portal/queries";
import { ServiceCard } from "@/components/portal/ServiceCard";
import { TodaySessionCard } from "@/components/portal/TodaySessionCard";
import { BorderRotate } from "@/components/ui/BorderRotate";

export default async function PortalHomePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  return (
    <div className="flex min-h-[calc(100dvh-56px-86px)] flex-col gap-5 px-4 pb-16 pt-5">
      {/* Hero + Today's session share one Suspense boundary — one round-trip */}
      <Suspense fallback={<HeroSkeleton />}>
        <PortalHomeContent clientId={me.id} firstName={me.firstName} />
      </Suspense>

      {/* Services */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/50">
            Services
          </p>
          <Link
            href="/portal/book"
            className="flex items-center gap-1 text-[11px] font-medium text-sage-deep"
          >
            See all <ArrowRight size={11} strokeWidth={2} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ServiceCard href="/portal/book?filter=ems"   iconKey="ems"   title="EMS Sculpting" subtitle="30 min · from £80" />
          <ServiceCard href="/portal/book?filter=fat"   iconKey="fat"   title="Fat Freezing"  subtitle="30–45 min · from £160" />
          <ServiceCard href="/portal/book?filter=bike"  iconKey="bike"  title="InfraBike"     subtitle="30 min · from £39" />
          <ServiceCard href="/portal/book?filter=laser" iconKey="laser" title="Laser Hair"    subtitle="15–60 min · from £9" />
        </div>
      </section>
    </div>
  );
}

// ─── Data + layout wrapper ─────────────────────────────────────────────────────

async function PortalHomeContent({
  clientId,
  firstName,
}: {
  clientId: string;
  firstName: string;
}) {
  const [loyalty, nextBooking] = await Promise.all([
    getLoyaltyAccount(clientId),
    getNextBooking(clientId),
  ]);

  // TODO: remove mock — testing TodaySessionCard display
  const todayBooking: NextBookingView = nextBooking ?? {
    bookingId: "test",
    startsAt: new Date(new Date().setHours(19, 0, 0, 0)).toISOString(),
    service: "EMS Body Sculpting",
    staffName: "Tove",
    durationMin: 30,
    resourceName: null,
    canReschedule: false,
  };

  return (
    <>
      <HeroCard
        firstName={firstName}
        loyalty={loyalty}
        nextBooking={nextBooking}
      />
      {todayBooking && (
        <BorderRotate
          animationMode="auto-rotate"
          animationSpeed={4}
          borderWidth={2}
          borderRadius={24}
          backgroundColor="#f2efe9"
          gradientColors={{
            primary:   "#2e3d22",
            secondary: "#758564",
            accent:    "#d4dcc8",
          }}
        >
          <TodaySessionCard booking={todayBooking} />
        </BorderRotate>
      )}
    </>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({
  firstName,
  loyalty,
  nextBooking,
}: {
  firstName: string;
  loyalty: LoyaltyView;
  nextBooking: NextBookingView | null;
}) {
  const greeting = getGreeting();
  const tierLabel = loyalty.tier ?? "Friend";
  const points = loyalty.currentPoints ?? 0;
  const ptsToNext =
    loyalty.nextReward && loyalty.nextReward.costPoints - points > 0
      ? loyalty.nextReward.costPoints - points
      : null;

  return (
    <div
      className="relative overflow-hidden rounded-[28px]"
      style={{ minHeight: 320 }}
    >
      {/* ── Full-bleed InfraBike photo ── */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/infrabike-hero.jpg')" }}
      />

      {/* ── Dark gradient overlay for readability ── */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(20,32,14,0.38) 0%, rgba(20,32,14,0.55) 45%, rgba(14,22,10,0.82) 100%)",
        }}
      />

      {/* ── Content ── */}
      <div className="relative flex flex-col justify-between" style={{ minHeight: 320 }}>

        {/* Top row — greeting + tier badge */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {greeting}
            </p>
            <h1 className="mt-1 font-serif text-[30px] font-medium leading-none tracking-tight text-white drop-shadow-sm">
              {firstName}
            </h1>
          </div>
          <div
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <Star size={9} className="fill-sage-light text-sage-light" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {tierLabel}
            </span>
          </div>
        </div>

        {/* ── Glass strip — points + CTA ── */}
        <div
          className="mx-3 mb-3 mt-auto rounded-[20px] p-4"
          style={{
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          {/* Points row */}
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Inner Circle
              </p>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-serif text-[40px] font-medium leading-none tracking-tight text-white">
                  {points.toLocaleString()}
                </span>
                <span className="mb-0.5 text-[13px] font-medium text-white/40">pts</span>
              </div>
            </div>
            {ptsToNext ? (
              <p className="max-w-[120px] text-right text-[11px] leading-snug text-white/45">
                {ptsToNext.toLocaleString()} pts to next reward
              </p>
            ) : loyalty.nextReward ? (
              <p className="text-right text-[11px] text-sage-light">
                Reward ready ✦
              </p>
            ) : null}
          </div>

          {/* CTA */}
          {nextBooking ? (
            <Link
              href="/portal/book"
              className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/10 px-4 py-3 transition-colors hover:bg-white/15"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15">
                <Calendar size={13} strokeWidth={1.8} className="text-sage-light" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white">
                  {nextBooking.service}
                </p>
                <p className="mt-0.5 text-[11px] text-white/45">
                  {format(new Date(nextBooking.startsAt), "EEE d MMM · HH:mm")}
                  {nextBooking.staffName ? ` · ${nextBooking.staffName}` : ""}
                </p>
              </div>
              <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-white/30" />
            </Link>
          ) : (
            <Link
              href="/portal/book"
              className="group flex items-center justify-between rounded-[14px] bg-sage px-5 py-3.5 transition-colors hover:bg-sage/90"
            >
              <span className="font-serif text-[16px] font-medium text-cream">
                Book a session
              </span>
              <ArrowRight
                size={15}
                strokeWidth={2}
                className="text-cream/80 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-[28px]"
      style={{
        minHeight: 320,
        background: "linear-gradient(160deg, #3a4a2c 0%, #28381c 100%)",
      }}
    >
      <div className="flex flex-col justify-between" style={{ minHeight: 320 }}>
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex flex-col gap-2.5">
            <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/20" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-white/25" />
          </div>
          <div className="h-7 w-16 animate-pulse rounded-full bg-white/15" />
        </div>
        <div className="mx-3 mb-3 mt-auto rounded-[20px] border border-white/10 bg-white/10 p-4">
          <div className="mb-3 flex flex-col gap-2">
            <div className="h-2 w-20 animate-pulse rounded-full bg-white/20" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-white/25" />
          </div>
          <div className="h-12 animate-pulse rounded-[14px] bg-white/15" />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Returns true when an ISO timestamp falls on today's date in Europe/London.
 * Using en-CA locale gives "YYYY-MM-DD" format — safe for direct comparison.
 */
function isBookingToday(isoString: string): boolean {
  const tz = "Europe/London";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const bookingDay = new Date(isoString).toLocaleDateString("en-CA", {
    timeZone: tz,
  });
  return today === bookingDay;
}
