"use client";

import Link from "next/link";
import Image from "next/image";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PractitionerOption } from "@/lib/portal/booking-queries";

/**
 * Practitioner picker (step 2 of 4 in the booking flow).
 *
 * Renders a row of cards — one per active staff who performs this
 * service — plus an "Any practitioner" option that lets the slot
 * picker fall back to the default staff (first by sort_order). The
 * selection is encoded in the URL so back/forward navigation feels
 * natural and links are shareable.
 *
 * Layout:
 *   - Mobile (< 768): horizontal scroll, fixed card width 168 px
 *   - ≥ 768: 3-column grid
 *
 * Selection visual: a subtle 2 px sage ring around the card (Apple
 * canonical). No new tokens.
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
  return (
    <div
      className={cn(
        "ax-tap flex flex-col items-center gap-3 rounded-lg border-[0.5px] border-hairline-strong bg-white p-4 shadow-1",
        "transition-all duration-200 ease-ios hover:shadow-2"
      )}
    >
      {variant === "any" ? (
        <AnyPractitionerCircle />
      ) : photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={88}
          height={88}
          className="h-[88px] w-[88px] rounded-full object-cover"
        />
      ) : (
        <InitialsCircle name={name} />
      )}
      <h3 className="text-center font-serif text-[18px] font-medium tracking-tight text-olive">
        {name}
      </h3>
      {subtitle && (
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
          style={{
            background: "rgba(117,133,100,0.10)",
            color: "#5C6B4E",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

function InitialsCircle({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="flex h-[88px] w-[88px] flex-shrink-0 items-center justify-center rounded-full text-[22px] font-medium tracking-snug text-cream"
      style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      aria-hidden
    >
      {initials || "✨"}
    </div>
  );
}

function AnyPractitionerCircle() {
  return (
    <div
      className="flex h-[88px] w-[88px] flex-shrink-0 items-center justify-center rounded-full bg-cream-deep text-olive-soft"
      aria-hidden
    >
      <CalendarCheck size={32} strokeWidth={1.6} />
    </div>
  );
}

function firstSpecialtyLabel(specialties: string[]): string | null {
  const s = specialties[0]?.trim();
  if (!s) return null;
  return `${s} specialist`;
}
