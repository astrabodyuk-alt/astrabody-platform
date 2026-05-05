import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, ChevronRight, ArrowRight, Star } from "lucide-react";
import { format } from "date-fns";
import {
  getCurrentClient,
  getLoyaltyAccount,
  getNextBooking,
} from "@/lib/portal/queries";
import { ServiceCard } from "@/components/portal/ServiceCard";

export default async function PortalHomePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  return (
    <div className="flex min-h-[calc(100dvh-56px-86px)] flex-col gap-5 px-4 pb-8 pt-5">
      {/* Hero card */}
      <Suspense fallback={<HeroSkeleton />}>
        <HeroCard clientId={me.id} firstName={me.firstName} />
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
          <ServiceCard href="/portal/book" iconKey="ems"   title="EMS Sculpting" subtitle="30 min · from £80" />
          <ServiceCard href="/portal/book" iconKey="fat"   title="Fat Freezing"  subtitle="30–45 min · from £160" />
          <ServiceCard href="/portal/book" iconKey="bike"  title="InfraBike"     subtitle="30 min · from £39" />
          <ServiceCard href="/portal/book" iconKey="laser" title="Laser Hair"    subtitle="15–60 min · from £9" />
        </div>
      </section>
    </div>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

async function HeroCard({
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

  const greeting = getGreeting();
  const tierLabel = loyalty.tier ?? "Friend";
  const points = loyalty.currentPoints ?? 0;
  const ptsToNext =
    loyalty.nextReward && loyalty.nextReward.costPoints - points > 0
      ? loyalty.nextReward.costPoints - points
      : null;

  return (
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-[28px] p-6"
      style={{
        background:
          "linear-gradient(160deg, #506040 0%, #3a4a2c 55%, #28381c 100%)",
        minHeight: 300,
      }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(187,196,170,0.18) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(117,133,100,0.22) 0%, transparent 70%)",
        }}
      />

      {/* Top row */}
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            {greeting}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-none tracking-tight text-white">
            {firstName}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
          <Star size={9} className="fill-sage-light text-sage-light" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
            {tierLabel}
          </span>
        </div>
      </div>

      {/* Points */}
      <div className="relative mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Inner Circle
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-serif text-[50px] font-medium leading-none tracking-tight text-white">
            {points.toLocaleString()}
          </span>
          <span className="mb-1 text-[14px] font-medium text-white/35">pts</span>
        </div>
        {ptsToNext ? (
          <p className="mt-1.5 text-[12px] text-white/40">
            {ptsToNext.toLocaleString()} pts to your next reward
          </p>
        ) : loyalty.nextReward ? (
          <p className="mt-1.5 text-[12px] text-sage-light">
            Reward ready to redeem ✦
          </p>
        ) : null}
      </div>

      {/* Next booking / CTA */}
      <div className="relative mt-5">
        {nextBooking ? (
          <Link
            href="/portal/book"
            className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/10 px-4 py-3.5 transition-colors hover:bg-white/14"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Calendar size={14} strokeWidth={1.8} className="text-sage-light" />
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
            <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-white/25" />
          </Link>
        ) : (
          <Link
            href="/portal/book"
            className="group flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-5 py-4 transition-colors hover:bg-white/15"
          >
            <span className="font-serif text-[17px] font-medium text-white">
              Book a session
            </span>
            <ArrowRight
              size={16}
              strokeWidth={2}
              className="text-sage-light transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-[28px] p-6"
      style={{
        background:
          "linear-gradient(160deg, #506040 0%, #3a4a2c 55%, #28381c 100%)",
        minHeight: 300,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2.5">
          <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/20" />
          <div className="h-7 w-32 animate-pulse rounded-full bg-white/25" />
        </div>
        <div className="h-7 w-16 animate-pulse rounded-full bg-white/15" />
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <div className="h-2 w-20 animate-pulse rounded-full bg-white/20" />
        <div className="h-12 w-24 animate-pulse rounded-full bg-white/25" />
        <div className="h-2 w-44 animate-pulse rounded-full bg-white/15" />
      </div>
      <div className="mt-5 h-[54px] animate-pulse rounded-2xl bg-white/10" />
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
