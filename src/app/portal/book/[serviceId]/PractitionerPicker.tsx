"use client";

import Link from "next/link";
import Image from "next/image";
import { CalendarCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PractitionerOption } from "@/lib/portal/booking-queries";

/**
 * Practitioner picker (step 2 of 4 in the booking flow).
 *
 * DestinationCard-style: full-bleed photo/gradient background, overlay,
 * glassmorphism footer with name + "Select →" CTA.
 *
 * Layout:
 *   - Mobile: horizontal scroll, fixed card width 168 px
 *   - ≥ 768: 3-column grid
 */
export function PractitionerPicker({
  serviceId,
  staff,
  rewardId,
}: {
  serviceId: string;
  staff: PractitionerOption[];
  rewardId?: string | null;
}) {
  const baseQuery = rewardId ? `&reward=${encodeURIComponent(rewardId)}` : "";

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex min-w-max gap-3 md:grid md:min-w-0 md:grid-cols-3">
        <li className="md:contents">
          <Link
            href={`/portal/book/${serviceId}?staff=any${baseQuery}`}
            className="block w-[168px] focus-visible:outline-none md:w-auto"
          >
            <PractitionerCard
              variant="any"
              name="Any practitioner"
              subtitle="Earliest slot, regardless of who"
            />
          </Link>
        </li>
        {staff.map((s) => (
          <li key={s.id} className="md:contents">
            <Link
              href={`/portal/book/${serviceId}?staff=${encodeURIComponent(s.id)}${baseQuery}`}
              className="block w-[168px] focus-visible:outline-none md:w-auto"
            >
              <PractitionerCard
                variant="staff"
                name={s.displayName}
                subtitle={firstSpecialtyLabel(s.specialties)}
                photoUrl={s.photoUrl}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PractitionerCard({
  variant,
  name,
  subtitle,
  photoUrl,
}: {
  variant: "any" | "staff";
  name: string;
  subtitle: string | null;
  photoUrl?: string | null;
}) {
  const initials =
    variant === "staff"
      ? name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join("")
      : null;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[20px] transition-transform duration-200 active:scale-[0.97]",
        "h-[220px] w-full"
      )}
    >
      {/* ── Background ── */}
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="168px"
        />
      ) : variant === "any" ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #BBC4AA 0%, #758564 60%, #3E4D2E 100%)",
          }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-start justify-end p-4"
          style={{
            background:
              "linear-gradient(135deg, #758564 0%, #5C6B4E 60%, #3E4D2E 100%)",
          }}
        >
          {/* Large faded initials as texture */}
          <span
            className="font-serif text-[80px] font-medium leading-none text-white/10 select-none"
            aria-hidden
          >
            {initials}
          </span>
        </div>
      )}

      {/* ── Dark gradient overlay ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(14,22,10,0.88) 0%, rgba(14,22,10,0.40) 45%, transparent 75%)",
        }}
      />

      {/* ── Content footer ── */}
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        {variant === "any" && (
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <CalendarCheck size={17} strokeWidth={1.6} className="text-white" />
          </div>
        )}

        <p className="font-serif text-[16px] font-medium leading-tight tracking-tight text-white">
          {name}
        </p>

        {subtitle && (
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/55">
            {subtitle}
          </p>
        )}

        {/* Glassmorphism CTA */}
        <div
          className="mt-2.5 flex items-center justify-between rounded-[10px] px-3 py-2 transition-colors group-hover:bg-white/20"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <span className="text-[11px] font-semibold tracking-wide text-white">
            Select
          </span>
          <ArrowRight
            size={11}
            strokeWidth={2.5}
            className="text-white/70 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </div>
  );
}

function firstSpecialtyLabel(specialties: string[]): string | null {
  const s = specialties[0]?.trim();
  if (!s) return null;
  return `${s} specialist`;
}
