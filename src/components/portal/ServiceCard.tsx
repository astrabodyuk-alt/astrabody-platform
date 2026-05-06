"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

interface ServiceCardProps {
  href: string;
  title: string;
  subtitle: string;
  iconKey: "ems" | "fat" | "bike" | "laser";
}

/**
 * Service card — full-bleed studio photo with dark gradient overlay.
 * Style inspired by premium fitness apps (photo-forward, text at bottom).
 * Each service uses its own studio photo.
 */

const SERVICE_CONFIG: Record<
  ServiceCardProps["iconKey"],
  {
    photo: string;
    label: string;
    /** Gradient tint — pushes the photo slightly toward the service's identity colour */
    tint: string;
  }
> = {
  ems: {
    photo: "/images/ems-sculpting.jpg",
    label: "Muscle · Sculpt",
    tint: "rgba(62,62,49,0.15)",
  },
  fat: {
    photo: "/images/fat-freezing.jpg",
    label: "Cryo · Slim",
    tint: "rgba(40,60,80,0.18)",
  },
  bike: {
    photo: "/images/infrabike-card.jpg",
    label: "Infrared · Detox",
    tint: "rgba(80,30,10,0.18)",
  },
  laser: {
    photo: "/images/laser-hair.jpg",
    label: "Diode · Smooth",
    tint: "rgba(50,30,70,0.18)",
  },
};

export function ServiceCard({ href, title, subtitle, iconKey }: ServiceCardProps) {
  const config = SERVICE_CONFIG[iconKey];

  return (
    <Link href={href} className="block">
      <motion.div
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -3, boxShadow: "0 14px 32px rgba(14,22,10,0.22)" }}
        transition={{ type: "spring" as const, stiffness: 400, damping: 22 }}
        className="relative overflow-hidden rounded-[20px] shadow-md"
        style={{ minHeight: 170 }}
      >
        {/* ── Full-bleed studio photo ── */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500"
          style={{ backgroundImage: `url('${config.photo}')` }}
        />

        {/* ── Colour tint layer ── */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: config.tint }}
        />

        {/* ── Bottom gradient for text legibility ── */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(10,16,8,0.82) 0%, rgba(10,16,8,0.35) 55%, transparent 100%)",
          }}
        />

        {/* ── Arrow top-right ── */}
        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
          <ArrowUpRight size={12} strokeWidth={2.2} className="text-white/80" />
        </div>

        {/* ── Text block bottom ── */}
        <div className="relative flex h-full flex-col justify-end" style={{ minHeight: 170 }}>
          <div className="px-3.5 pb-3.5">
            {/* Category tag */}
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
              {config.label}
            </p>
            {/* Service name */}
            <p className="font-serif text-[17px] font-medium leading-tight text-white">
              {title}
            </p>
            {/* Price & duration */}
            <p className="mt-0.5 text-[11px] text-white/50">{subtitle}</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
