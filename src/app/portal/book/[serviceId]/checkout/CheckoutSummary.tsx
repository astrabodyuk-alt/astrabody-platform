"use client";

import { Card } from "@/components/ui/card";
import { VoucherChip, voucherLabel } from "@/components/loyalty/VoucherChip";
import { cn, formatGBP, formatPoints } from "@/lib/utils";
import { pointsForPrice } from "@/lib/loyalty/constants";
import type { CombineResult, VoucherForCombiner } from "@/lib/loyalty/price-combiner";
import type { WalletVoucher } from "@/lib/loyalty/wallet";

interface Props {
  serviceName: string;
  staffName: string;
  startsAt: Date;
  pricePence: number;
  depositPence: number;
  /** Wallet snapshot for the current client. Empty arrays + 0 = no rewards. */
  wallet: { currentPoints: number; vouchers: WalletVoucher[] };
  /** Result of combinePrice() for the currently-displayed amount. */
  combined: CombineResult;
  /** Toggle state lifted from the parent. */
  applyRewards: boolean;
  onToggleApplyRewards: (next: boolean) => void;
  /** True when this booking is on a /portal/me free_service redemption. */
  redemptionActive: boolean;
}

/**
 * Right-column summary card on /checkout. Now reward-aware.
 *
 * Layout:
 *   - Booking facts (service / date / time / staff)
 *   - Hairline
 *   - Either the standard single-line price OR the line-item breakdown
 *     (when the wallet has applicable rewards and the toggle is on).
 *   - Total today + remaining at studio (when applicable)
 *   - Apply rewards toggle (only when there's anything to apply)
 *   - Earn-on-session promise line
 */
export function CheckoutSummary({
  serviceName,
  staffName,
  startsAt,
  pricePence,
  depositPence,
  wallet,
  combined,
  applyRewards,
  onToggleApplyRewards,
  redemptionActive,
}: Props) {
  const dateLabel = startsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const timeLabel = startsAt
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();

  // Earn promise based on the FULL price (not the discounted total).
  // Per spec: points credit on completion, never at checkout.
  const points = pointsForPrice(pricePence);
  const baseAmount = depositPence > 0 ? depositPence : pricePence;
  const showRemaining = depositPence > 0 && pricePence > depositPence;
  const todayLabel = depositPence > 0 ? "Deposit today" : "Total today";

  const hasRewards =
    !redemptionActive &&
    (wallet.currentPoints > 0 || wallet.vouchers.length > 0);

  // Vouchers that are actually usable for THIS service (used for the
  // line items when the toggle is on).
  const applicableVouchers: WalletVoucher[] = redemptionActive
    ? []
    : wallet.vouchers.filter((v) => {
        if (v.kind === "free_service") return false; // free-service unused unless paired with the redemption flow
        return true;
      });

  return (
    <Card className="p-5">
      <h2 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Your booking
      </h2>

      <div className="mt-4 flex flex-col gap-1">
        <p className="text-[14px] font-medium tracking-snug text-olive">
          {serviceName}
        </p>
        <p className="text-[13px] tracking-snug text-olive-soft">{dateLabel}</p>
        <p className="text-[13px] tracking-snug text-olive-soft">
          {timeLabel} with {staffName}
        </p>
      </div>

      <div className="my-5 h-px w-full bg-hairline" aria-hidden />

      {/* All price/toggle/points content in one explicit flex-col so nothing
          escapes the card when inside a sticky aside with md:self-start. */}
      <div className="flex flex-col gap-5">
        {/* Price block */}
        <div className="flex flex-col gap-2">
          {hasRewards && applyRewards ? (
            <Breakdown
              baseAmount={baseAmount}
              combined={combined}
              appliedVouchers={applicableVouchers.filter((v) =>
                combined.appliedVoucherIds.includes(v.id)
              )}
            />
          ) : (
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] tracking-snug text-olive-soft">
                {todayLabel}
              </span>
              <span className="font-serif text-[22px] font-medium tabular-nums text-sage-deep">
                {formatGBP(baseAmount)}
              </span>
            </div>
          )}

          {showRemaining && (
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] tracking-snug text-olive-soft">
                Remaining at studio
              </span>
              <span className="text-[14px] tabular-nums text-olive">
                {formatGBP(pricePence - depositPence)}
              </span>
            </div>
          )}
        </div>

        {/* Rewards toggle — always a direct child of the gap-5 column */}
        {hasRewards && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Apply my rewards
            </span>
            <Toggle
              checked={applyRewards}
              onChange={() => onToggleApplyRewards(!applyRewards)}
              label="Apply my rewards"
            />
          </div>
        )}

        {/* Points promise */}
        {points > 0 && (
          <p className="text-[12px] tracking-snug text-sage">
            You&rsquo;ll earn {formatPoints(points)} points on this session.
          </p>
        )}
      </div>
    </Card>
  );
}

function Breakdown({
  baseAmount,
  combined,
  appliedVouchers,
}: {
  baseAmount: number;
  combined: CombineResult;
  appliedVouchers: WalletVoucher[];
}) {
  const { breakdown, pointsApplied } = combined;
  return (
    <div className="flex flex-col gap-2">
      {/* Standard price */}
      <Row label="Standard price" value={formatGBP(baseAmount)} />

      {/* Points line */}
      {pointsApplied > 0 && (
        <Row
          label={`${formatPoints(pointsApplied)} points`}
          value={`−${formatGBP(pointsApplied)}`}
          subtle
        />
      )}

      {/* Voucher lines (one per voucher, in the order they were stacked) */}
      {appliedVouchers.map((v) => (
        <Row
          key={v.id}
          label={`Your ${voucherLabel({
            kind: v.kind,
            valuePct: v.valuePct,
            valuePence: v.valuePence,
            serviceId: v.serviceId,
          })} voucher`}
          value={`−${voucherDiscountLabel(v, baseAmount)}`}
          chip={
            <VoucherChip
              voucher={{
                kind: v.kind,
                valuePct: v.valuePct,
                valuePence: v.valuePence,
                serviceId: v.serviceId,
                serviceName: v.serviceName,
                expiresAt: v.expiresAt,
              }}
            />
          }
        />
      ))}

      {/* Hairline before total */}
      <div className="my-2 h-px w-full bg-hairline" aria-hidden />

      <div className="flex items-baseline justify-between">
        <span className="text-[13px] tracking-snug text-olive">
          Total today
        </span>
        <span className="flex items-baseline gap-1 font-serif text-[22px] font-medium tabular-nums text-sage-deep">
          {formatGBP(breakdown.final)}
          {breakdown.final < breakdown.base && <span>✨</span>}
        </span>
      </div>
    </div>
  );
}

function voucherDiscountLabel(v: WalletVoucher, base: number): string {
  if (v.kind === "amount") return formatGBP(v.valuePence ?? 0);
  if (v.kind === "percent")
    return formatGBP(Math.floor((base * (v.valuePct ?? 0)) / 100));
  return "";
}

function Row({
  label,
  value,
  subtle,
  chip,
}: {
  label: string;
  value: string;
  subtle?: boolean;
  chip?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn(
          "flex items-center gap-2 text-[13px] tracking-snug",
          subtle ? "text-olive-soft" : "text-olive"
        )}
      >
        {chip}
        {label}
      </span>
      <span className="text-[14px] tabular-nums text-olive">{value}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-[31px] w-[51px] flex-shrink-0 overflow-hidden rounded-full transition-colors duration-200 ease-ios",
        checked ? "bg-sage" : "bg-[#E9E9EA]"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-ios",
          "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]",
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}
