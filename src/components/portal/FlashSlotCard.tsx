"use client";

import { Card } from "@/components/ui/card";
import { cn, formatGBP } from "@/lib/utils";

export interface FlashSlotCardProps {
  startsAt: string; // ISO
  service: string;
  staffName: string;
  durationMin: number;
  listPricePence: number;
  flashPricePence: number;
  onClick?: () => void;
  className?: string;
}

export function FlashSlotCard({
  startsAt,
  service,
  staffName,
  durationMin,
  listPricePence,
  flashPricePence,
  onClick,
  className,
}: FlashSlotCardProps) {
  const time = new Date(startsAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn("flex items-center gap-3 p-4 px-[18px]", className)}
    >
      <div className="w-[60px] flex-shrink-0 font-serif text-[22px] font-medium leading-none tracking-tight text-olive">
        {time}
      </div>
      <div className="flex-1">
        <div className="text-[14px] font-medium tracking-snug text-olive">
          {service}
        </div>
        <div className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
          {durationMin} min · with {staffName}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="font-serif text-[20px] font-medium leading-none tracking-tight text-sage-deep">
          {formatGBP(flashPricePence)}
        </div>
        <div className="mt-0.5 text-[11px] text-olive-faint line-through">
          {formatGBP(listPricePence)}
        </div>
      </div>
    </Card>
  );
}
