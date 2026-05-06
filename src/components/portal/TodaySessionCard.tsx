"use client";

import { motion } from "framer-motion";
import { Activity, Snowflake, Bike, Sparkles } from "lucide-react";
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
  icon: string;
  text: string;
}

const SESSION_TIPS: Record<string, Tip[]> = {
  bike: [
    { icon: "💧", text: "Drink a good glass of water before you get in — you'll sweat" },
    { icon: "🍌", text: "A light snack an hour before is fine; skip the heavy meals" },
    { icon: "👕", text: "Wear loose, breathable clothing — it gets warm in there" },
    { icon: "⏰", text: "Aim to arrive 5 minutes early to settle in comfortably" },
  ],
  ems: [
    { icon: "💧", text: "Hydrate well — good hydration really improves muscle response" },
    { icon: "🥗", text: "No large meals within 2 hours; a light snack is absolutely fine" },
    { icon: "👗", text: "Fitted clothing works best for proper electrode contact" },
    { icon: "⏰", text: "Arrive 5 minutes early so we can get you prepped" },
  ],
  fat: [
    { icon: "🚫", text: "Avoid alcohol for 24 hours before — it can affect the results" },
    { icon: "💧", text: "Hydrate well the day before and the morning of your session" },
    { icon: "👚", text: "Loose, comfortable clothing that you can easily adjust" },
    { icon: "🧴", text: "Moisturise the treatment area the night before, not the morning of" },
  ],
  laser: [
    { icon: "🪒", text: "Shave the area the day before — not the morning of your appointment" },
    { icon: "☀️", text: "Avoid sun exposure for 48 hours before coming in" },
    { icon: "🚫", text: "No waxing or threading — shaving only in the weeks leading up" },
    { icon: "🧴", text: "Come with clean, product-free skin — no fake tan or heavy creams" },
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
      className="overflow-hidden rounded-[24px]"
      style={{
        border: "1px solid rgba(117,133,100,0.18)",
        boxShadow: "0 4px 20px rgba(62,62,49,0.08)",
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
      <div className="px-5 py-4" style={{ background: "#f9f7f3" }}>
        <p
          className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: colors.iconColor }}
        >
          Before your session
        </p>

        <motion.ul
          role="list"
          className="flex flex-col gap-2.5"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {tips.map((tip, i) => (
            <motion.li
              key={i}
              role="listitem"
              variants={itemVariants}
              className="flex items-start gap-3 rounded-[14px] px-3 py-2.5"
              style={{ background: "rgba(117,133,100,0.06)" }}
            >
              <span
                className="mt-0.5 shrink-0 text-[15px] leading-none"
                aria-hidden="true"
              >
                {tip.icon}
              </span>
              <span className="text-[12px] leading-relaxed text-olive/65">
                {tip.text}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </motion.div>
  );
}
