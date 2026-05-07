"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, ArrowRight } from "lucide-react";
import { formatGBP } from "@/lib/utils";
import type { FlashSlot } from "@/lib/flash-slots/queries";
import { format } from "date-fns";

/**
 * Full-width "Flash Deal" card shown on the portal home when an active
 * flash slot exists. Dark sage gradient, glassmorphism details pill,
 * countdown timer, and "Claim deal →" CTA.
 */
export function FlashDealCard({ slot }: { slot: FlashSlot }) {
  const savings = slot.originalPricePence - slot.flashPricePence;
  const pct = Math.round((savings / slot.originalPricePence) * 100);
  const timeRange = `${format(new Date(slot.slotStart), "HH:mm")}–${format(new Date(slot.slotEnd), "HH:mm")}`;

  const bookHref = `/portal/book/${slot.serviceId}?flash=${slot.id}${slot.staffId ? `&staff=${slot.staffId}` : ""}`;

  return (
    <Link href={bookHref} className="block focus-visible:outline-none">
      <div
        className="relative overflow-hidden rounded-[20px] p-4 transition-transform active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #BBC4AA 0%, #758564 45%, #3E4D2E 100%)",
        }}
      >
        {/* Glow accent */}
        <div
          className="absolute -right-8 -top-8 size-32 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.4), transparent)" }}
        />

        {/* Top row: badge + countdown */}
        <div className="flex items-start justify-between">
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}
          >
            <Zap size={11} strokeWidth={2.5} />
            Flash Deal
          </span>
          <Countdown expiresAt={slot.expiresAt} />
        </div>

        {/* Heading */}
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/60">
            Today · {timeRange}
          </p>
          <h3 className="mt-0.5 font-serif text-[22px] font-medium leading-tight tracking-tight text-white">
            {slot.label}
          </h3>
          {slot.description && (
            <p className="mt-0.5 text-[13px] text-white/70">{slot.description}</p>
          )}
        </div>

        {/* Price + CTA glassmorphism pill */}
        <div
          className="mt-3.5 flex items-center justify-between rounded-[12px] px-3.5 py-2.5"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div>
            <span className="text-[20px] font-bold text-white">
              {formatGBP(slot.flashPricePence)}
            </span>
            <span className="ml-2 text-[13px] text-white/50 line-through">
              {formatGBP(slot.originalPricePence)}
            </span>
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white">
              −{pct}%
            </span>
          </div>
          <span className="flex items-center gap-1 text-[13px] font-semibold text-white">
            Claim deal <ArrowRight size={13} strokeWidth={2} />
          </span>
        </div>

        {slot.maxClaims > 1 && (
          <p className="mt-2 text-center text-[11px] text-white/50">
            {slot.maxClaims - slot.claimsCount} spot{slot.maxClaims - slot.claimsCount !== 1 ? "s" : ""} left
          </p>
        )}
      </div>
    </Link>
  );
}

// ── Countdown timer ────────────────────────────────────────────────────────────

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(getRemainingStr(expiresAt));

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemainingStr(expiresAt)), 10_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!remaining) return null;

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/80"
      style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(4px)" }}
    >
      {remaining}
    </span>
  );
}

function getRemainingStr(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "";
  const totalMin = Math.floor(diffMs / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
