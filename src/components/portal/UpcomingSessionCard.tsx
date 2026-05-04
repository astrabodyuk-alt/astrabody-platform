"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface UpcomingSessionCardProps {
  /** ISO 8601 date-time of the booking. */
  startsAt: string;
  service: string;
  staffName: string;
  durationMin: number;
  resourceName?: string | null;
  /** When set, the chevron menu surfaces a Reschedule link. */
  bookingId?: string | null;
  canReschedule?: boolean;
  onClick?: () => void;
  className?: string;
}

export function UpcomingSessionCard({
  startsAt,
  service,
  staffName,
  durationMin,
  resourceName,
  bookingId,
  canReschedule,
  onClick,
  className,
}: UpcomingSessionCardProps) {
  const date = new Date(startsAt);
  const day = date.getDate().toString();
  const month = date
    .toLocaleString("en-GB", { month: "short" })
    .toUpperCase();
  const time = date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const showMenu = !!bookingId && !!canReschedule;

  return (
    <div ref={wrapperRef} className="relative">
      <Card
        interactive
        onClick={onClick}
        className={cn("p-5", className)}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="flex items-center gap-4">
          <div className="flex w-14 flex-shrink-0 flex-col items-center rounded-md bg-cream-deep py-2">
            <span className="font-serif text-[28px] font-medium leading-none text-olive">
              {day}
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-label-caps text-olive-soft">
              {month}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium tracking-snug text-olive">
              {service}
              {resourceName ? (
                <span className="text-olive-soft"> · {resourceName}</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[13px] tracking-snug text-olive-soft">
              {time} with {staffName} · {durationMin} min
            </div>
          </div>
          {showMenu ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Booking actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cream-deep text-olive transition-colors duration-200 ease-ios hover:bg-sage/10"
            >
              <MoreHorizontal size={18} strokeWidth={1.6} />
            </button>
          ) : (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cream-deep text-olive">
              <ChevronRight size={18} strokeWidth={1.6} />
            </div>
          )}
        </div>
      </Card>

      {showMenu && menuOpen && bookingId && (
        <div
          role="menu"
          className="absolute right-3 top-[68px] z-20 w-44 overflow-hidden rounded-[12px] border-[0.5px] border-hairline bg-white shadow-2"
        >
          <Link
            href={`/portal/booking/${bookingId}/reschedule`}
            className="block px-4 py-2.5 text-[13px] tracking-snug text-olive hover:bg-cream-deep/60"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
          >
            Reschedule
          </Link>
        </div>
      )}
    </div>
  );
}
