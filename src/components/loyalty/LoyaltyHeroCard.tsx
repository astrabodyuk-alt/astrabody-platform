"use client";

import { cn, formatPoints, LoyaltyTier, TIER_COPY } from "@/lib/utils";

/**
 * The single most important surface in the app — the Inner Circle hero
 * card. Built to specifically match Apple Wallet's premium-card aesthetic:
 *   - dark gradient base with inset highlight
 *   - subtle radial wash (top-right + bottom-left)
 *   - tier badge in glass with a faint pulsing dot
 *   - editorial Cormorant numerals
 *   - progress bar with sage-light → gold-soft horizontal gradient
 *
 * Pure presentational component. Data comes from the server-fetched
 * loyalty_accounts row (current_points, lifetime_points, tier).
 */
export interface LoyaltyHeroCardProps {
  tier: LoyaltyTier;
  currentPoints: number;
  lifetimePoints: number;
  /** Optional: the next reward the user is closest to. */
  nextReward?: {
    name: string;
    costPoints: number;
  };
  /** Optional: the date the user joined the programme, formatted for display. */
  memberSince?: string;
  className?: string;
}

export function LoyaltyHeroCard({
  tier,
  currentPoints,
  lifetimePoints,
  nextReward,
  memberSince,
  className,
}: LoyaltyHeroCardProps) {
  const tierMeta = TIER_COPY[tier];

  // Progress logic: distance to next reward, falling back to next tier.
  const progress = (() => {
    if (nextReward) {
      const remaining = Math.max(0, nextReward.costPoints - currentPoints);
      const pct = Math.min(
        100,
        Math.round((currentPoints / nextReward.costPoints) * 100)
      );
      return { remaining, pct, target: nextReward };
    }
    // Fallback: progress to next tier.
    const nextThreshold =
      tier === "friend" ? 1500 : tier === "insider" ? 10000 : 10000;
    const prevThreshold =
      tier === "friend" ? 0 : tier === "insider" ? 1500 : 10000;
    const pct =
      tier === "inner_circle"
        ? 100
        : Math.min(
            100,
            Math.round(
              ((lifetimePoints - prevThreshold) /
                (nextThreshold - prevThreshold)) *
                100
            )
          );
    const remaining = Math.max(0, nextThreshold - lifetimePoints);
    return { remaining, pct, target: null };
  })();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl p-6 text-cream shadow-3 ax-tap",
        "transition-all duration-200 ease-ios",
        className
      )}
      style={{
        background:
          "linear-gradient(165deg, #2F3829 0%, #5C6B4E 60%, #758564 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(62,62,49,0.10), 0 18px 40px rgba(62,62,49,0.18)",
      }}
    >
      {/* Top-right radial highlight (Apple Wallet card sheen) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[40%] -right-[25%] h-[280px] w-[280px] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.10), transparent)",
        }}
      />
      {/* Bottom-left ambient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 0% 100%, rgba(187,196,170,0.12), transparent 60%)",
        }}
      />

      {/* Tier badge row */}
      <div className="relative z-10 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium uppercase tracking-label-caps"
          style={{
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-gold-soft animate-pulse"
            style={{ boxShadow: "0 0 8px rgba(229,210,168,0.7)" }}
          />
          {tierMeta.label}
        </span>
        {memberSince && (
          <span className="text-[11px] font-normal tracking-wide text-cream/70">
            Joined {memberSince}
          </span>
        )}
      </div>

      {/* The number */}
      <div className="relative z-10 mt-7">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-label-caps text-cream/70">
          Inner Circle balance
        </div>
        <div className="ax-display text-[56px] leading-none text-cream">
          {formatPoints(currentPoints)}
          <span className="ml-2 align-middle font-sans text-[14px] font-normal uppercase tracking-wider text-cream/70">
            pts
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-5 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-600 ease-ios"
          style={{
            width: `${progress.pct}%`,
            background:
              "linear-gradient(90deg, #BBC4AA 0%, #E5D2A8 100%)",
          }}
        />
      </div>

      {/* Next-reward line */}
      <div className="relative z-10 mt-2.5 text-[13px] tracking-snug text-cream/85">
        {progress.target ? (
          <>
            <strong className="font-medium text-cream">
              {formatPoints(progress.remaining)} points
            </strong>{" "}
            to your next {progress.target.name.toLowerCase()}.
          </>
        ) : tier === "inner_circle" ? (
          <>You&rsquo;re in the Inner Circle. Enjoy what you&rsquo;ve earned.</>
        ) : (
          <>
            <strong className="font-medium text-cream">
              {formatPoints(progress.remaining)} points
            </strong>{" "}
            to {tierMeta.nextLabel}.
          </>
        )}
      </div>
    </div>
  );
}
