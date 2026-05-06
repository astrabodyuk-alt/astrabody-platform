"use client";

import { motion } from "framer-motion";
import {
  Activity, Snowflake, Bike, Sparkles,
  Droplets, Apple, Shirt, Clock,
  Wine, Droplet, Scissors, Sun, Ban,
  UtensilsCrossed, Zap, Coffee,
} from "lucide-react";
import { format } from "date-fns";
import type { NextBookingView } from "@/lib/portal/queries";

// ─── Service config ────────────────────────────────────────────────────────────

const SERVICE_ICON_MAP: Record<string, React.ElementType> = {
  ems:   Activity,
  fat:   Snowflake,
  bike:  Bike,
  laser: Sparkles,
};

const SERVICE_COLORS: Record<string, { iconColor: string; iconBg: string }> = {
  ems:   { iconColor: "#758564", iconBg: "rgba(117,133,100,0.15)" },
  fat:   { iconColor: "#5a8faa", iconBg: "rgba(90,143,170,0.14)" },
  bike:  { iconColor: "#b86040", iconBg: "rgba(184,96,64,0.13)" },
  laser: { iconColor: "#8c68b8", iconBg: "rgba(140,104,184,0.13)" },
};

interface Tip {
  Icon: React.ElementType;
  text: string;
}

const SESSION_TIPS: Record<string, Tip[]> = {
  /**
   * InfraBike — Source: Astrabody Nutrition Blueprint, Section 05
   * Pre-session: 500ml water 90 min before (not right before), light carb-forward snack.
   * Post-session: 750ml water + electrolytes within the hour.
   */
  bike: [
    {
      Icon: Droplets,
      text: "Drink 500ml of water 90 minutes before — not right before, or it'll feel heavy in the pod",
    },
    {
      Icon: Apple,
      text: "Half a banana with almond butter, 90 min before — you need the carbs. You'll sweat properly.",
    },
    {
      Icon: Shirt,
      text: "Loose, breathable clothing — the pod reaches temperatures that make you genuinely sweat",
    },
    {
      Icon: Zap,
      text: "After: 750ml water + pinch of sea salt + squeeze of lemon within the hour. Replenish what you lost.",
    },
  ],

  /**
   * EMS Body Sculpting — Source: Astrabody Nutrition Blueprint, Section 05
   * Pre-session: real meal 2h before (protein + carb + veg). 150–200ml water + pinch salt 30 min before.
   * Post-session golden window: 30g protein within 45 min.
   */
  ems: [
    {
      Icon: UtensilsCrossed,
      text: "Eat a proper meal 2 hours before — protein + carb + vegetables. 30,000 contractions need real fuel.",
    },
    {
      Icon: Droplets,
      text: "30 minutes before: 150–200ml water with a pinch of salt. Nothing to eat after that.",
    },
    {
      Icon: Shirt,
      text: "Fitted clothing only — loose fabric reduces electrode contact and weakens your results",
    },
    {
      Icon: Zap,
      text: "Golden window: within 45 minutes after, have 30g of protein (shake, eggs, chicken). Your muscles absorb fastest right now.",
    },
  ],

  /**
   * Fat Freezing — Source: Astrabody Nutrition Blueprint, Section 05
   * Pre-session: light protein + carb 90 min before. 500ml water in the hour before.
   * No alcohol 24h before. Post-session: warm herbal tea, no cold food/drink 2h.
   */
  fat: [
    {
      Icon: Apple,
      text: "90 minutes before: Greek yoghurt + berries, or a boiled egg on rye. Light — you'll be lying down for 45 minutes.",
    },
    {
      Icon: Droplets,
      text: "Drink 500ml water the hour before — the cold works faster on well-hydrated fat cells",
    },
    {
      Icon: Wine,
      text: "No alcohol for 24 hours before — it slows the treatment results by up to 30%",
    },
    {
      Icon: Coffee,
      text: "After your session: warm herbal tea (ginger or turmeric). No cold food or drink for at least 2 hours.",
    },
  ],

  /**
   * Laser Hair Removal — Source: KB/05_diode_laser_technical.md + standard clinical protocols
   * Shave day before. No sun 48h. No waxing. Clean, product-free skin.
   */
  laser: [
    {
      Icon: Scissors,
      text: "Shave the treatment area the day before — not the morning of your appointment",
    },
    {
      Icon: Sun,
      text: "No sun exposure for 48 hours before — tanned skin increases risk and reduces effectiveness",
    },
    {
      Icon: Ban,
      text: "No waxing or threading — only shaving in the 6 weeks leading up to your sessions",
    },
    {
      Icon: Droplet,
      text: "Come with clean, product-free skin — no fake tan, perfume or heavy creams on the area",
    },
  ],
};

function resolveServiceKey(serviceName: string): string {
  const s = serviceName.toLowerCase();
  if (s.includes("infra") || s.includes("bike")) return "bike";
  if (s.includes("ems") || s.includes("sculpt")) return "ems";
  if (s.includes("fat") || s.includes("freez") || s.includes("cryo")) return "fat";
  if (s.includes("laser") || s.includes("hair")) return "laser";
  return "bike";
}

// ─── Animation variants ────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 22, delay: 0.08 },
  },
};

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 180, damping: 16 },
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function TodaySessionCard({ booking }: { booking: NextBookingView }) {
  const key = resolveServiceKey(booking.service);
  const Icon = (SERVICE_ICON_MAP[key] ?? Sparkles) as React.ElementType;
  const colors = SERVICE_COLORS[key] ?? SERVICE_COLORS.ems!;
  const tips = SESSION_TIPS[key] ?? SESSION_TIPS.bike!;
  const sessionTime = format(new Date(booking.startsAt), "HH:mm");
  const sessionDate = format(new Date(booking.startsAt), "EEEE d MMMM");

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="overflow-hidden rounded-[22px]"
      style={{
        boxShadow: "none",
      }}
    >
      {/* ── Dark sage header — time + date ── */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          background: "linear-gradient(135deg, #2e3d22 0%, #3a4a2d 100%)",
        }}
      >
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
            Today&apos;s Session
          </p>
          <p className="mt-0.5 font-serif text-[32px] font-medium leading-none tracking-tight text-white">
            {sessionTime}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium text-white/50">{sessionDate}</p>
          <p className="mt-1 text-[12px] font-semibold text-white/70">
            {booking.durationMin} min
          </p>
        </div>
      </div>

      {/* ── Service row ── */}
      <div
        className="flex items-center gap-3 border-b px-5 py-3.5"
        style={{
          background: "#f9f7f3",
          borderColor: "rgba(117,133,100,0.12)",
        }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: colors.iconBg }}
        >
          <Icon size={20} strokeWidth={1.5} style={{ color: colors.iconColor }} />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-olive">{booking.service}</p>
          <p className="mt-0.5 text-[11px] text-olive/45">
            {booking.durationMin} min
            {booking.staffName ? ` · with ${booking.staffName}` : ""}
          </p>
        </div>
      </div>

      {/* ── Pre-session tips with stagger animation ── */}
      <div className="px-4 pb-4 pt-3" style={{ background: "#f2efe9" }}>
        <p
          className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: colors.iconColor }}
        >
          Before your session
        </p>

        <motion.ul
          role="list"
          className="flex flex-col gap-2"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {tips.map((tip, i) => (
            <motion.li
              key={i}
              role="listitem"
              variants={itemVariants}
              className="flex items-center gap-3 rounded-[14px] px-3 py-3"
              style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(117,133,100,0.10)" }}
            >
              {/* Icon box */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: colors.iconBg }}
              >
                <tip.Icon size={16} strokeWidth={1.6} style={{ color: colors.iconColor }} />
              </div>
              <span className="text-[12.5px] leading-snug text-olive/70">
                {tip.text}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
}
