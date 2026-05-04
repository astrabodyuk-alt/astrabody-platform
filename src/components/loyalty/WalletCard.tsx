"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VoucherChip } from "@/components/loyalty/VoucherChip";
import { cn, formatGBP, formatPoints } from "@/lib/utils";
import type { WalletVoucher } from "@/lib/loyalty/wallet";

/**
 * /portal home wallet card. Lives between the LoyaltyHeroCard and the
 * "Your next session" empty/filled card.
 *
 * Mobile (< 768): collapses to a 1-line tappable summary
 *   "£8.40 in rewards · tap to see"
 * Desktop (≥ 768): always rendered fully.
 */
export function WalletCard({
  currentPoints,
  vouchers,
}: {
  currentPoints: number;
  vouchers: WalletVoucher[];
}) {
  const [expanded, setExpanded] = useState(false);

  const summaryPence = approximateRewardsValuePence(currentPoints, vouchers);
  const hasRewards = currentPoints > 0 || vouchers.length > 0;
  const summaryLine = hasRewards
    ? `${formatGBP(summaryPence)} in rewards · tap to see`
    : "Your rewards · tap to see";

  return (
    <Card className="overflow-hidden">
      {/* Mobile collapsed state — only visible < md and only when not expanded */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "flex w-full items-center justify-between p-5 md:hidden",
          expanded && "hidden"
        )}
        aria-expanded={expanded}
      >
        <span className="text-[14px] font-medium tracking-snug text-olive">
          {summaryLine}
        </span>
        <ChevronRight size={18} strokeWidth={1.6} className="text-olive-soft" />
      </button>

      {/* Full content — visible md+ always; visible < md when expanded */}
      <div
        className={cn(
          "p-5 md:block",
          expanded ? "block" : "hidden"
        )}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-[22px] font-medium tracking-tight text-olive">
            Your rewards
          </h3>
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="md:hidden"
              aria-label="Collapse"
            >
              <ChevronDown
                size={18}
                strokeWidth={1.6}
                className="text-olive-soft"
              />
            </button>
          )}
        </div>

        {/* Points row */}
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium tracking-snug text-olive">
            Points
          </span>
          <span className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[14px] font-medium text-olive">
              {formatPoints(currentPoints)} pts
            </span>
            <span className="text-[12px] text-olive-soft">
              ≈ {formatGBP(currentPoints)} off
            </span>
          </span>
        </div>

        {/* Vouchers */}
        <div className="mt-4 flex flex-col gap-2.5">
          {vouchers.length === 0 ? (
            <p className="text-[13px] tracking-snug text-olive-soft">
              Earn rewards by leaving a review, referring a friend, or hitting
              Insider tier.
            </p>
          ) : (
            vouchers.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3"
              >
                <VoucherChip voucher={v} />
                <span className="flex-1 text-right text-[12px] tracking-snug text-olive-soft">
                  {voucherSourceLabel(v.source)} · {expiryLabel(v.expiresAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Approximate cash value of the wallet for the mobile summary line.
 * Percent vouchers are valued against £39 (a typical session) — this
 * is just a quick "what's in here" hint, not the actual checkout maths.
 */
function approximateRewardsValuePence(
  points: number,
  vouchers: WalletVoucher[]
): number {
  const TYPICAL_SESSION = 3900;
  const fromAmount = vouchers
    .filter((v) => v.kind === "amount")
    .reduce((acc, v) => acc + (v.valuePence ?? 0), 0);
  const fromPercent = vouchers
    .filter((v) => v.kind === "percent")
    .reduce(
      (acc, v) => acc + Math.round((TYPICAL_SESSION * (v.valuePct ?? 0)) / 100),
      0
    );
  return points + fromAmount + fromPercent;
}

function voucherSourceLabel(source: string): string {
  switch (source) {
    case "google_review":
      return "Earned for your Google review";
    case "referral":
      return "Earned for a referral";
    case "manual_admin":
      return "Issued by Astrabody";
    case "tier_unlock":
      return "Tier unlock";
    default:
      return "Reward";
  }
}

function expiryLabel(expiresAt: string): string {
  const days = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  );
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  if (days <= 14) return `expires in ${days} days`;
  return `expires in ${days} days`;
}
