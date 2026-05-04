import { cn, formatGBP } from "@/lib/utils";

export interface VoucherChipData {
  kind: "percent" | "amount" | "free_service";
  valuePct: number | null;
  valuePence: number | null;
  serviceId: string | null;
  serviceName?: string | null;
  expiresAt?: string;
}

/**
 * Sage-on-cream voucher chip. Same component used in:
 *   - /portal home WalletCard
 *   - /portal/book/[serviceId]/checkout summary line items
 *
 * If the voucher expires in 14 days or fewer, the chip carries a small
 * gold dot tagged "Expires soon" for screen readers.
 */
export function VoucherChip({
  voucher,
  className,
}: {
  voucher: VoucherChipData;
  className?: string;
}) {
  const label = voucherLabel(voucher);
  const expiresSoon = voucher.expiresAt
    ? isExpiringSoon(voucher.expiresAt)
    : false;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-sage px-3 py-1 text-[12px] font-medium tabular-nums text-cream",
        className
      )}
    >
      {label}
      {expiresSoon && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold"
          title="Expires soon"
          aria-label="Expires soon"
        />
      )}
    </span>
  );
}

export function voucherLabel(v: VoucherChipData): string {
  if (v.kind === "percent") return `−${v.valuePct ?? 0}%`;
  if (v.kind === "amount") return `−${formatGBP(v.valuePence ?? 0)}`;
  // free_service
  return v.serviceName ? `Free ${v.serviceName}` : "Free session";
}

export function isExpiringSoon(expiresAt: string): boolean {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms < 0) return false;
  const days = ms / 86_400_000;
  return days <= 14;
}
