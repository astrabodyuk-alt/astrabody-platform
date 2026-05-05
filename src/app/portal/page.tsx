import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  ChevronRight,
  MessageCircle,
  ShoppingBag,
  Star,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import {
  getCurrentClient,
  getLoyaltyAccount,
  getNextBooking,
} from "@/lib/portal/queries";
import type { LucideIcon } from "lucide-react";

/**
 * Portal home — Apple/Linear aesthetic.
 * Hero streams in via Suspense; quick actions render instantly.
 */
export default async function PortalHomePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  return (
    <div className="flex min-h-[calc(100dvh-56px-86px)] flex-col gap-4 px-4 pb-8 pt-5">
      {/* Hero */}
      <Suspense fallback={<HeroSkeleton />}>
        <HeroCard clientId={me.id} firstName={me.firstName} />
      </Suspense>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickAction href="/portal/book" Icon={Calendar} label="Book" />
        <QuickAction href="/portal/chat" Icon={MessageCircle} label="Chat" />
        <QuickAction href="/portal/shop" Icon={ShoppingBag} label="Shop" />
      </div>
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
        minHeight: 320,
      }}
    >
      {/* Ambient glow top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(187,196,170,0.18) 0%, transparent 70%)",
        }}
      />
      {/* Ambient glow bottom-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(117,133,100,0.25) 0%, transparent 70%)",
        }}
      />

      {/* Top row */}
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/40">
            {greeting}
          </p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-none tracking-tight text-white">
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
      <div className="relative mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Inner Circle
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-serif text-[52px] font-medium leading-none tracking-tight text-white">
            {points.toLocaleString()}
          </span>
          <span className="mb-1 text-[14px] font-medium text-white/35">pts</span>
        </div>
        {ptsToNext ? (
          <p className="mt-2 text-[12px] text-white/40">
            {ptsToNext.toLocaleString()} pts until your next reward
          </p>
        ) : loyalty.nextReward ? (
          <p className="mt-2 text-[12px] text-sage-light">
            Reward ready to redeem
          </p>
        ) : null}
      </div>

      {/* Next booking / CTA */}
      <div className="relative mt-6">
        {nextBooking ? (
          <Link
            href="/portal/book"
            className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/8 px-4 py-3.5 backdrop-blur-sm transition-colors hover:bg-white/12"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
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
            className="group flex items-center justify-between rounded-2xl border border-white/12 bg-white/8 px-5 py-4 backdrop-blur-sm transition-all hover:bg-white/14"
          >
            <span className="text-[14px] font-medium text-white">
              Book your first session
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
        minHeight: 320,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2.5">
          <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/20" />
          <div className="h-8 w-32 animate-pulse rounded-full bg-white/25" />
        </div>
        <div className="h-7 w-16 animate-pulse rounded-full bg-white/15" />
      </div>
      <div className="mt-8 flex flex-col gap-2.5">
        <div className="h-2 w-20 animate-pulse rounded-full bg-white/20" />
        <div className="h-12 w-28 animate-pulse rounded-full bg-white/25" />
        <div className="h-2 w-44 animate-pulse rounded-full bg-white/15" />
      </div>
      <div className="mt-6 h-[52px] animate-pulse rounded-2xl bg-white/10" />
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickAction({
  href,
  Icon,
  label,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2.5 rounded-2xl bg-white py-5 shadow-sm transition-all duration-200 active:scale-95 hover:shadow-md"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage/8 transition-colors group-hover:bg-sage/12">
        <Icon size={18} strokeWidth={1.7} className="text-sage-deep" />
      </div>
      <span className="text-[12px] font-medium tracking-wide text-olive">
        {label}
      </span>
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
