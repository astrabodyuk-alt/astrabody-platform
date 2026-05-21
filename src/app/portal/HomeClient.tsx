"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bike, Zap, Calendar, ChevronRight, Sparkles, ArrowUpRight } from "lucide-react";
import { FlashDealCard } from "@/components/portal/FlashDealCard";
import type { LoyaltyView } from "@/lib/portal/queries";
import type { FlashSlot } from "@/lib/flash-slots/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivePack {
  id: string;
  sessions_total: number;
  sessions_remaining: number;
  services: { name: string } | Array<{ name: string }> | null;
}

interface UpcomingBooking {
  id: string;
  starts_at: string;
  services:
    | { name: string; duration_min: number }
    | Array<{ name: string; duration_min: number }>
    | null;
  staff:
    | { display_name: string }
    | Array<{ display_name: string }>
    | null;
}

interface HomeData {
  clientId: string;
  firstName: string;
  loyalty: LoyaltyView;
  nextBooking: unknown;
  flashSlots: FlashSlot[];
  activePacks: ActivePack[];
  upcomingBookings: UpcomingBooking[];
  weekCounts: number[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickFirst<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function serviceIcon(name: string | undefined) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bike") || n.includes("infra")) return Bike;
  if (n.includes("ems") || n.includes("sculpt")) return Zap;
  return Sparkles;
}

// ─── localStorage cache ───────────────────────────────────────────────────────

const CACHE_KEY = "ab:home:v1";

function readCache(): HomeData | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HomeData) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(data: HomeData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HomeClient() {
  const [fallback] = useState<HomeData | undefined>(readCache);

  const { data } = useSWR<HomeData>("/api/portal/home", {
    fallbackData: fallback,
    onSuccess: writeCache,
  });

  if (!data) return <HomeSkeleton />;

  const { firstName, loyalty, flashSlots, activePacks, upcomingBookings, weekCounts } = data;

  const points     = loyalty?.currentPoints ?? 0;
  const maxPts     = loyalty?.nextReward?.costPoints ?? 1000;
  const ptsToNext  = Math.max(0, maxPts - points);
  const ringPct    = Math.min(points / maxPts, 1);
  const ringC      = 226;
  const ringOffset = ringC - ringC * ringPct;
  const todayIdx   = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const maxCount   = Math.max(...weekCounts, 1);
  const totalWeekSessions = weekCounts.reduce((a, b) => a + b, 0);
  const nextBooking = upcomingBookings[0] ?? null;
  const nextSvc = nextBooking ? pickFirst(nextBooking.services) : null;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col md:min-h-screen md:flex-row">

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-4 md:gap-5 md:p-6">

        {/* ── Hero — personal balance card (FlowPay inspired) ── */}
        <div
          className="relative overflow-hidden rounded-[22px] px-5 py-5"
          style={{ background: "#3E3E31", minHeight: 164 }}
        >
          {/* Decorative rings */}
          <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full opacity-[0.07]" style={{ border: "32px solid #BBC4AA" }} />
          <div aria-hidden className="pointer-events-none absolute -right-2 top-14 h-16 w-16 rounded-full opacity-[0.06]" style={{ border: "12px solid #BBC4AA" }} />

          <div className="relative z-10">
            {/* Greeting */}
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
              {getGreeting()}, {firstName}
            </p>

            {/* Points balance — big Cormorant number */}
            <div className="mt-1 flex items-end gap-2">
              <span className="font-serif text-[52px] font-medium leading-none tracking-tight text-cream">
                {points.toLocaleString("en-GB")}
              </span>
              <span className="mb-1.5 text-[13px] font-medium text-white/40">pts</span>
            </div>

            {/* Subtitle */}
            <p className="mt-1 text-[12px] text-white/45">
              {ptsToNext > 0
                ? `${ptsToNext.toLocaleString("en-GB")} pts to your next reward`
                : "You've reached your next reward 🎁"}
            </p>

            {/* CTA */}
            <Link
              href="/portal/book"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-cream px-4 py-2 text-[12px] font-semibold text-olive transition-opacity hover:opacity-90 active:scale-[0.97]"
            >
              Book a session
              <ArrowUpRight size={12} strokeWidth={2.5} className="text-olive/70" />
            </Link>
          </div>
        </div>

        {/* ── 3 Stat cards (FlowPay row) ── */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Sessions this week */}
          <div className="rounded-[16px] border border-sand bg-white p-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-olive/35">
              This week
            </p>
            <p className="mt-1.5 font-serif text-[26px] font-medium leading-none text-olive">
              {totalWeekSessions}
            </p>
            <p className="mt-1 text-[10px] text-olive/40">sessions</p>
          </div>

          {/* Points */}
          <div className="rounded-[16px] border border-sand bg-white p-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-olive/35">
              Balance
            </p>
            <p className="mt-1.5 font-serif text-[26px] font-medium leading-none text-olive">
              {points.toLocaleString("en-GB")}
            </p>
            <p className="mt-1 text-[10px] text-olive/40">points</p>
          </div>

          {/* Next session */}
          <div className="rounded-[16px] border border-sand bg-white p-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-olive/35">
              Next
            </p>
            {nextBooking ? (
              <>
                <p className="mt-1.5 font-serif text-[16px] font-medium leading-tight text-olive">
                  {format(new Date(nextBooking.starts_at), "d MMM")}
                </p>
                <p className="mt-0.5 text-[10px] text-olive/40">
                  {format(new Date(nextBooking.starts_at), "HH:mm")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 font-serif text-[16px] font-medium leading-tight text-olive/30">
                  —
                </p>
                <p className="mt-0.5 text-[10px] text-sage">Book now</p>
              </>
            )}
          </div>
        </div>

        {/* ── Flash slots ── */}
        {flashSlots.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-olive/35">
              ⚡ Today only
            </p>
            <div className="flex flex-col gap-3">
              {flashSlots.map((slot) => (
                <FlashDealCard key={slot.id} slot={slot} />
              ))}
            </div>
          </section>
        )}

        {/* ── Services ── */}
        <ServiceCards activePacks={activePacks} />

        {/* ── Upcoming sessions ── */}
        <section>
          <div className="mb-3 flex items-center justify-between px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-olive/35">
              Upcoming sessions
            </p>
            <Link href="/portal/book" className="text-[11px] font-medium text-sage hover:underline">
              Book more
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <Link
              href="/portal/book"
              className="flex items-center gap-3 rounded-[16px] border border-sand bg-white px-4 py-3.5 transition-colors hover:bg-sand/10 active:scale-[0.99]"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cream-deep">
                <Calendar size={15} strokeWidth={1.5} className="text-sage" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-olive">No upcoming sessions</p>
                <p className="mt-0.5 text-[11px] text-olive/40">Tap to book your next visit</p>
              </div>
              <ChevronRight size={14} strokeWidth={1.6} className="text-olive/20" />
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingBookings.map((booking) => {
                const svc   = pickFirst(booking.services);
                const staff = pickFirst(booking.staff);
                const name  = svc?.name ?? "Session";
                const Icon  = serviceIcon(name);
                const d     = new Date(booking.starts_at);
                return (
                  <div
                    key={booking.id}
                    className="flex items-center gap-3.5 rounded-[16px] border border-sand bg-white px-4 py-3"
                  >
                    {/* Date block */}
                    <div className="flex w-[42px] flex-shrink-0 flex-col items-center justify-center rounded-[10px] bg-cream-deep py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-olive/40">
                        {format(d, "MMM")}
                      </span>
                      <span className="font-serif text-[22px] font-medium leading-none text-olive">
                        {format(d, "d")}
                      </span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-medium text-olive">{name}</p>
                      <p className="mt-0.5 text-[11px] text-olive/40">
                        {format(d, "HH:mm")} · {svc?.duration_min ?? 30} min
                        {staff ? ` · ${staff.display_name}` : ""}
                      </p>
                    </div>
                    {/* Icon */}
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage/10">
                      <Icon size={14} strokeWidth={1.6} className="text-sage" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Supplements teaser — small inline card ── */}
        <div className="flex items-center justify-between rounded-[16px] border border-sand bg-white px-4 py-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-olive/35">Coming soon</p>
            <p className="mt-0.5 text-[13px] font-medium text-olive">Nutritional supplements</p>
          </div>
          <Link
            href="/portal/shop"
            className="rounded-full bg-cream-deep px-3 py-1.5 text-[11px] font-semibold text-olive/60 hover:bg-sand transition-colors"
          >
            Notify me
          </Link>
        </div>

      </div>

      {/* ── Right panel — desktop only ────────────────────────────────────── */}
      <div className="hidden md:flex w-[200px] flex-shrink-0 flex-col gap-4 border-l border-sand/40 p-4 pt-5">

        {/* Points ring */}
        <div className="rounded-[16px] border border-sand bg-white p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-olive/35">
            Loyalty
          </p>
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-[80px] w-[80px]">
              <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#EDE8E1" strokeWidth="7" />
                <circle
                  cx="40" cy="40" r="32"
                  fill="none"
                  stroke="#758564"
                  strokeWidth="7"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-serif text-[15px] font-medium text-olive">
                  {Math.round(ringPct * 100)}%
                </span>
              </div>
            </div>
            <p className="text-center text-[12px] font-medium text-olive">
              {points.toLocaleString("en-GB")} pts
            </p>
            {loyalty?.nextReward && (
              <p className="text-center text-[10px] text-olive/40 leading-snug">
                {ptsToNext.toLocaleString("en-GB")} pts to next reward
              </p>
            )}
          </div>
        </div>

        {/* Bar chart */}
        <div className="rounded-[16px] border border-sand bg-white p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-olive/35">
            This week
          </p>
          <div className="flex items-end gap-[5px]" style={{ height: 48 }}>
            {weekCounts.map((count, i) => {
              const barH   = Math.max(3, Math.round((count / maxCount) * 38));
              const active = i === todayIdx;
              const labels = ["M", "T", "W", "T", "F", "S", "S"];
              return (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-[3px]"
                  style={{ justifyContent: "flex-end", height: "100%" }}
                >
                  <div
                    className="w-full rounded-t-[3px] transition-all"
                    style={{ height: barH, background: active ? "#758564" : "#DED2C3" }}
                  />
                  <span className="text-[8px]" style={{ color: active ? "#758564" : "#BBC4AA", fontWeight: active ? 600 : 400 }}>
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team */}
        <div className="rounded-[16px] border border-sand bg-white p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-olive/35">
            Your team
          </p>
          <div className="flex flex-col gap-3">
            {(
              [
                { name: "Jade",  role: "Therapist", bg: "#BBC4AA", fg: "#3E3E31" },
                { name: "Nigel", role: "Founder",   bg: "#758564", fg: "#F6F3EE" },
              ] as const
            ).map(({ name, role, bg, fg }) => (
              <div key={name} className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ background: bg, color: fg }}
                >
                  {name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium leading-none text-olive">{name}</p>
                  <p className="mt-0.5 text-[10px] leading-none text-olive/40">{role}</p>
                </div>
                <Link
                  href="/portal/book"
                  className="text-[10px] font-medium text-sage hover:underline"
                >
                  Book
                </Link>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── ServiceCards ─────────────────────────────────────────────────────────────

const FIXED_SERVICES = [
  { key: "bike",  label: "InfraBike",       subtitle: "£39 / session", Icon: Bike, bookFilter: "bike" },
  { key: "ems",   label: "EMS SupraSculpt", subtitle: "£80 / session", Icon: Zap,  bookFilter: "ems"  },
] as const;

function ServiceCards({ activePacks }: { activePacks: ActivePack[] }) {
  const packByKey = new Map<string, ActivePack>();
  for (const pack of activePacks) {
    const name = (pickFirst(pack.services)?.name ?? "").toLowerCase();
    if (name.includes("bike") || name.includes("infra")) packByKey.set("bike", pack);
    if (name.includes("ems")  || name.includes("sculpt")) packByKey.set("ems", pack);
  }

  return (
    <section>
      <p className="mb-3 px-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-olive/35">
        Your services
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {FIXED_SERVICES.map(({ key, label, subtitle, Icon, bookFilter }) => {
          const pack = packByKey.get(key);
          const used = pack ? pack.sessions_total - pack.sessions_remaining : null;

          return (
            <Link
              key={key}
              href={`/portal/book?filter=${bookFilter}`}
              className="group flex flex-col rounded-[16px] border border-sand bg-white p-4 transition-all hover:border-sage/25 hover:shadow-sm active:scale-[0.98]"
            >
              {/* Icon row */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sage/8 transition-colors group-hover:bg-sage/12">
                  <Icon size={16} strokeWidth={1.5} className="text-sage" />
                </div>
                {pack && (
                  <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-semibold text-sage">
                    {pack.sessions_remaining} left
                  </span>
                )}
              </div>

              {/* Label */}
              <p className="text-[13px] font-medium text-olive">{label}</p>

              {pack ? (
                <>
                  <p className="mt-0.5 text-[11px] text-olive/40">
                    {used} / {pack.sessions_total} used
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-sand/70">
                    <div
                      className="h-full rounded-full bg-sage transition-all"
                      style={{ width: `${Math.round(((used ?? 0) / pack.sessions_total) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-0.5 text-[11px] font-medium text-sage">{subtitle}</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row md:gap-5 md:p-6">
      <div className="flex flex-1 flex-col gap-4">
        <div className="h-[164px] animate-pulse rounded-[22px] bg-olive/10" />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[80px] animate-pulse rounded-[16px] bg-sand/60" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-[96px] animate-pulse rounded-[16px] bg-sand/60" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="h-[64px] animate-pulse rounded-[16px] bg-sand/60" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="hidden md:flex w-[200px] flex-col gap-4">
        <div className="h-[160px] animate-pulse rounded-[16px] bg-sand/60" />
        <div className="h-[90px] animate-pulse rounded-[16px] bg-sand/60" />
        <div className="h-[130px] animate-pulse rounded-[16px] bg-sand/60" />
      </div>
    </div>
  );
}
