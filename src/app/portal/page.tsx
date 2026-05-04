import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, ChevronRight, Sparkles } from "lucide-react";
import { format } from "date-fns";
import {
  getCurrentClient,
  getLoyaltyAccount,
  getNextBooking,
} from "@/lib/portal/queries";

/**
 * Portal home — intentionally minimal. One hero card, three quick
 * actions, no scroll. Everything else lives in the hamburger drawer.
 */
export default async function PortalHomePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  const [loyalty, nextBooking] = await Promise.all([
    getLoyaltyAccount(me.id),
    getNextBooking(me.id),
  ]);

  const greeting = getGreeting();
  const tierLabel = loyalty.tier ?? "FRIEND";
  const points = loyalty.currentPoints ?? 0;

  return (
    <div className="flex min-h-[calc(100dvh-56px-86px)] flex-col px-4 pb-6 pt-4">
      {/* ── Hero card ─────────────────────────────────────────── */}
      <div
        className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl p-6"
        style={{
          background:
            "linear-gradient(145deg, #4a5a3a 0%, #3a4a2c 50%, #2e3d22 100%)",
          minHeight: 340,
        }}
      >
        {/* Decorative blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #BBC4AA, transparent)" }}
        />

        {/* Top row: greeting + tier */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] tracking-wide text-cream/60">
              {greeting}
            </p>
            <h1 className="mt-0.5 font-serif text-[28px] font-medium leading-tight tracking-tight text-cream">
              {me.firstName}
            </h1>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-cream/80">
            <span className="size-1.5 rounded-full bg-sage-light" />
            {tierLabel}
          </span>
        </div>

        {/* Points */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-cream/50">
            Inner Circle Balance
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[56px] font-medium leading-none tracking-tight text-cream">
              {points.toLocaleString()}
            </span>
            <span className="text-[16px] font-medium text-cream/50">pts</span>
          </div>
          {loyalty.nextReward && (
            <p className="mt-2 text-[12px] text-cream/50">
              {loyalty.nextReward.costPoints - points > 0
                ? `${(loyalty.nextReward.costPoints - points).toLocaleString()} pts to your next reward`
                : "Reward ready to redeem"}
            </p>
          )}
        </div>

        {/* Next session pill */}
        {nextBooking ? (
          <div className="flex items-center gap-3 rounded-2xl border border-cream/15 bg-cream/10 px-4 py-3">
            <Calendar size={16} strokeWidth={1.6} className="shrink-0 text-sage-light" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-cream truncate">
                {nextBooking.service}
              </p>
              <p className="text-[11px] text-cream/50">
                {format(new Date(nextBooking.startsAt), "EEE d MMM · HH:mm")} · with{" "}
                {nextBooking.staffName}
              </p>
            </div>
            <ChevronRight size={14} className="shrink-0 text-cream/30" />
          </div>
        ) : (
          <Link
            href="/portal/book"
            className="flex items-center justify-center gap-2 rounded-2xl border border-cream/15 bg-cream/10 px-4 py-3 text-[13px] font-medium text-cream transition-colors hover:bg-cream/20"
          >
            <Sparkles size={14} strokeWidth={1.6} />
            Book your first session
          </Link>
        )}
      </div>

      {/* ── Quick actions ─────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <QuickAction href="/portal/book" emoji="📅" label="Book" />
        <QuickAction href="/portal/chat" emoji="💬" label="Chat" />
        <QuickAction href="/portal/shop" emoji="🛍" label="Shop" />
      </div>
    </div>
  );
}

function QuickAction({
  href,
  emoji,
  label,
}: {
  href: string;
  emoji: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-white/60 py-4 text-[12px] font-medium tracking-wide text-olive transition-colors hover:bg-sage/5"
    >
      <span className="text-[22px] leading-none">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
