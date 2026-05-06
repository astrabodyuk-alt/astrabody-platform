"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Snowflake, Bike, Sparkles } from "lucide-react";

interface ServiceCardProps {
  href: string;
  title: string;
  subtitle: string;
  iconKey: "ems" | "fat" | "bike" | "laser";
}

const ICONS: Record<ServiceCardProps["iconKey"], React.ReactNode> = {
  ems:   <Activity  size={22} strokeWidth={1.4} className="text-sage" />,
  fat:   <Snowflake size={22} strokeWidth={1.4} className="text-sage" />,
  bike:  <Bike      size={22} strokeWidth={1.4} className="text-sage" />,
  laser: <Sparkles  size={22} strokeWidth={1.4} className="text-sage" />,
};

export function ServiceCard({ href, title, subtitle, iconKey }: ServiceCardProps) {
  return (
    <Link href={href}>
      <motion.div
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(62,62,49,0.10)" }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage/8">
          {ICONS[iconKey]}
        </div>
        <div>
          <p className="text-[14px] font-medium text-olive">{title}</p>
          <p className="mt-0.5 text-[12px] text-olive/50">{subtitle}</p>
        </div>
      </motion.div>
    </Link>
  );
}
