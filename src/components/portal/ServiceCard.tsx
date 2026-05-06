"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Snowflake, Bike, Sparkles, ArrowUpRight } from "lucide-react";

interface ServiceCardProps {
  href: string;
  title: string;
  subtitle: string;
  iconKey: "ems" | "fat" | "bike" | "laser";
}

/**
 * Service card — premium design with unique gradient per service.
 * Each card has:
 *   - Tinted gradient background (unique per service)
 *   - Large semi-transparent watermark icon (decorative depth)
 *   - Smaller accent icon box in the top-left
 *   - Arrow indicator top-right
 */

const SERVICE_CONFIG: Record<
  ServiceCardProps["iconKey"],
  {
    bg: string;
    iconColor: string;
    iconBg: string;
    watermarkColor: string;
    label: string;
  }
> = {
  ems: {
    bg: "linear-gradient(145deg, #eef2e8 0%, #e2ead4 100%)",
    iconColor: "#758564",
    iconBg: "rgba(117,133,100,0.14)",
    watermarkColor: "rgba(117,133,100,0.08)",
    label: "Muscle · Sculpt",
  },
  fat: {
    bg: "linear-gradient(145deg, #e8eff5 0%, #d8e8f2 100%)",
    iconColor: "#5a8faa",
    iconBg: "rgba(90,143,170,0.13)",
    watermarkColor: "rgba(90,143,170,0.07)",
    label: "Cryo · Slim",
  },
  bike: {
    bg: "linear-gradient(145deg, #f5ede6 0%, #f0e0d2 100%)",
    iconColor: "#b86040",
    iconBg: "rgba(184,96,64,0.12)",
    watermarkColor: "rgba(184,96,64,0.07)",
    label: "Infrared · Detox",
  },
  laser: {
    bg: "linear-gradient(145deg, #f2edf8 0%, #e8dff5 100%)",
    iconColor: "#8c68b8",
    iconBg: "rgba(140,104,184,0.12)",
    watermarkColor: "rgba(140,104,184,0.07)",
    label: "Diode · Smooth",
  },
};

const ICONS: Record<ServiceCardProps["iconKey"], React.ElementType> = {
  ems:   Activity,
  fat:   Snowflake,
  bike:  Bike,
  laser: Sparkles,
};

export function ServiceCard({ href, title, subtitle, iconKey }: ServiceCardProps) {
  const config = SERVICE_CONFIG[iconKey];
  const Icon = ICONS[iconKey];

  return (
    <Link href={href} className="block">
      <motion.div
        whileTap={{ scale: 0.97 }}
        whileHover={{ y: -2, boxShadow: "0 10px 28px rgba(62,62,49,0.12)" }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="relative overflow-hidden rounded-2xl p-4 shadow-sm"
        style={{
          background: config.bg,
          minHeight: 130,
        }}
      >
        {/* Watermark icon — large decorative background */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-3"
          style={{ color: config.watermarkColor }}
        >
          <Icon size={88} strokeWidth={1.1} color={config.watermarkColor} />
        </div>

        {/* Arrow top-right */}
        <div className="absolute right-3.5 top-3.5">
          <ArrowUpRight
            size={14}
            strokeWidth={2}
            style={{ color: config.iconColor, opacity: 0.5 }}
          />
        </div>

        {/* Icon box */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: config.iconBg }}
        >
          <Icon size={20} strokeWidth={1.5} style={{ color: config.iconColor }} />
        </div>

        {/* Text */}
        <div className="mt-3">
          <p className="text-[14px] font-semibold text-olive">{title}</p>
          <p className="mt-0.5 text-[11px] text-olive/50">{subtitle}</p>
          <p
            className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: config.iconColor, opacity: 0.7 }}
          >
            {config.label}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}
