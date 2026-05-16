"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bike, Zap, Snowflake, Sparkles, Calendar, ChevronRight } from "lucide-react";
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
  if (n.includes("ems")  || n.includes("sculpt")) return Zap;
  if (n.includes("freez") || n.includes("cryo") || n.includes("fat")) return Snowflake;
  return Sparkles;
}

function sessionCardBg(name: string | undefined) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bike") || n.includes("infra")) return "#DED2C3";
  if (n.includes("ems")  || n.includes("sculpt")) return "#BBC4AA";
  if (n.includes("freez") || n.includes("cryo") || n.includes("fat")) return "#E8EDE3";
  return "#EDE8E1";
}

// ─── localStorage cache helpers ───────────────────────────────────────────────

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
  // Seed SWR with the last-known data so the dashboard renders instantly
  // on repeat visits — no skeleton flash even if the API is still loading.
  const [fallback] = useState<HomeData | undefined>(readCache);

  const { data } = useSWR<HomeData>("/api/portal/home", {
    fallbackData: fallback,
    onSuccess: writeCache,
  });

  if (!data) return <HomeSkeleton />;

  const { firstName, loyalty, flashSlots, activePacks, upcomingBookings, weekCounts } = data;

  const points     = loyalty?.currentPoints ?? 0;
  const maxPts     = loyalty?.nextReward?.costPoints ?? 1000;
  const ringPct    = Math.min(points / maxPts, 1);
  const ringC      = 226; // 2π × 36
  const ringOffset = ringC - ringC * ringPct;
  const todayIdx   = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const maxCount   = Math.max(...weekCounts, 1);

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col md:min-h-screen md:flex-row">

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">

        {/* Hero banner */}
        <div
          className="relative overflow-hidden rounded-[20px] p-5"
          style={{ background: "#3E3E31", minHeight: 148 }}
        >
          <div aria-hidden
            className="pointer-events-none absolute right-4 top-3 h-24 w-24 rounded-full opacity-25"
            style={{ border: "20px solid #758564" }}
          />
          <div aria-hidden
            className="pointer-events-none absolute right-12 bottom-[-18px] h-14 w-14 rounded-full opacity-15"
            style={{ border: "14px solid #758564" }}
          />
          <div className="relative z-10">
            <div
              className="mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ background: "rgba(117,133,100,0.28)" }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sage-light">
                Coming soon
              </span>
            </div>
            <h1 className="mb-4 max-w-[210px] font-serif text-[22px] font-medium leading-[1.25] tracking-tight text-cream">
              Nutritional supplements, tailored to you
            </h1>
            <Link
              href="/portal/shop"
              className="inline-flex items-center gap-2 rounded-full bg-cream px-4 py-2 text-[13px] font-medium text-olive transition-opacity hover:opacity-90"
            >
              Order
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-olive">
                <ChevronRight size={10} strokeWidth={2.5} className="text-cream" />
              </span>
            </Link>
          </div>
        </div>

        {/* Flash slots */}
        {flashSlots.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/40">
              ⚡ Today only
            </p>
            <div className="flex flex-col gap-3">
              {flashSlots.map((slot) => (
                <FlashDealCard key={slot.id} slot={slot} />
              ))}
            </div>
          </section>
        )}

        {/* Services / pack progress — always shown (InfraBike + EMS) */}
        <ServiceCards activePacks={activePacks} />

        {/* Upcoming sessions */}
        <section>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/40">
              Upcoming sessions
            </p>
            <Link href="/portal/book" className="text-[11px] font-medium text-sage">
              Book more
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <Link
              href="/portal/book"
              className="flex items-center gap-3 rounded-[14px] border border-sand bg-white px-4 py-3.5 transition-colors hover:bg-sand/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sand/60">
                <Calendar size={14} strokeWidth={1.6} className="text-sage" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-olive">No upcoming sessions</p>
                <p className="mt-0.5 text-[11px] text-olive/40">Tap to book your next visit</p>
              </div>
              <ChevronRight size={13} strokeWidth={1.8} className="text-olive/25" />
            </Link>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {upcomingBookings.map((booking) => {
                const svc   = pickFirst(booking.services);
                const staff = pickFirst(booking.staff);
                const name  = svc?.name ?? "Session";
                const Icon  = serviceIcon(name);
                const bg    = sessionCardBg(name);
                return (
                  <div key={booking.id} className="overflow-hidden rounded-[14px] border border-sand bg-white">
                    <div
                      className="flex h-[68px] items-center justify-center"
                      style={{ background: bg }}
                    >
                      <Icon size={26} strokeWidth={1.4} className="text-olive" />
                    </div>
                    <div className="p-3">
                      <span className="mb-1.5 inline-block rounded-full bg-sand/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-sage">
                        {name.split(" ")[0]}
                      </span>
                      <p className="text-[12px] font-medium leading-snug text-olive">
                        {name} · {svc?.duration_min ?? 30} min
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-sand text-[9px] font-semibold text-olive">
                          {(staff?.display_name ?? "?")[0]}
                        </div>
                        <p className="text-[11px] text-olive/45">
                          {staff?.display_name ?? "Team"} ·{" "}
                          {format(new Date(booking.starts_at), "EEE d MMM")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent treatments link (desktop) */}
        <section className="hidden md:block">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/40">
              Recent treatments
            </p>
            <Link href="/portal/me" className="text-[11px] font-medium text-sage">
              See all
            </Link>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-sand bg-white">
            <p className="p-4 text-[13px] text-olive/40">
              Visit{" "}
              <Link href="/portal/me" className="text-sage underline underline-offset-2">
                your profile
              </Link>{" "}
              to see your full treatment history and loyalty rewards.
            </p>
          </div>
        </section>

      </div>

      {/* ── Right panel — desktop only ────────────────────────────────────── */}
      <div className="hidden md:flex w-[185px] flex-shrink-0 flex-col gap-4 border-l border-sand/50 p-4">

        {/* Points ring */}
        <div className="rounded-[14px] border border-sand bg-white p-4">
          <p className="mb-3 text-[13px] font-medium text-olive">Points</p>
          <div className="flex flex-col items-center">
            <div className="relative h-[88px] w-[88px]">
              <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
                <circle cx="44" cy="44" r="36" fill="none" stroke="#EDE8E1" strokeWidth="9" />
                <circle
                  cx="44" cy="44" r="36"
                  fill="none"
                  stroke="#758564"
                  strokeWidth="9"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[16px] font-medium text-olive">
                  {Math.round(ringPct * 100)}%
                </span>
              </div>
            </div>
            <p className="mt-2 text-center text-[12px] font-medium text-olive">
              {getGreeting()}, {firstName}
            </p>
            <p className="mt-0.5 text-center text-[11px] text-olive/40">
              {points.toLocaleString()} pts
              {loyalty?.nextReward
                ? ` · ${(maxPts - points).toLocaleString()} to next`
                : ""}
            </p>
          </div>
        </div>

        {/* Sessions bar chart */}
        <div className="rounded-[14px] border border-sand bg-white p-4">
          <p className="mb-3 text-[13px] font-medium text-olive">This week</p>
          <div className="flex items-end gap-[5px]" style={{ height: 56 }}>
            {weekCounts.map((count, i) => {
              const barH   = Math.max(4, Math.round((count / maxCount) * 46));
              const active = i === todayIdx;
              const labels = ["M", "T", "W", "T", "F", "S", "S"];
              return (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-[3px]"
                  style={{ justifyContent: "flex-end", height: "100%" }}
                >
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: barH,
                      background: active ? "#758564" : "#EDE8E1",
                    }}
                  />
                  <span
                    className="text-[9px]"
                    style={{
                      color: active ? "#758564" : "#BBC4AA",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team */}
        <div className="rounded-[14px] border border-sand bg-white p-4">
          <p className="mb-3 text-[13px] font-medium text-olive">Your team</p>
          <div className="flex flex-col gap-2.5">
            {(
              [
                { name: "Tove",  role: "Therapist", bg: "#DED2C3", fg: "#3E3E31" },
                { name: "Jade",  role: "Therapist", bg: "#BBC4AA", fg: "#3E3E31" },
                { name: "Nigel", role: "Founder",   bg: "#758564", fg: "#F6F3EE" },
              ] as const
            ).map(({ name, role, bg, fg }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: bg, color: fg }}
                  >
                    {name[0]}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium leading-none text-olive">{name}</p>
                    <p className="mt-0.5 text-[10px] leading-none text-olive/40">{role}</p>
                  </div>
                </div>
                <Link
                  href="/portal/book"
                  className="rounded-full bg-sand/50 px-2 py-1 text-[10px] font-medium text-sage transition-colors hover:bg-sand"
                >
                  Book
                </Link>
              </div>
            ))}
          </div>
          <Link
            href="/portal/book"
            className="mt-3 flex w-full items-center justify-center rounded-[8px] bg-sand/40 py-2 text-[12px] font-medium text-sage transition-colors hover:bg-sand/70"
          >
            See all
          </Link>
        </div>

      </div>
    </div>
  );
}

// ─── ServiceCards — always show InfraBike + EMS ──────────────────────────────

const FIXED_SERVICES = [
  { key: "bike",  label: "InfraBike",       Icon: Bike, bookFilter: "bike" },
  { key: "ems",   label: "EMS SupraSculpt", Icon: Zap,  bookFilter: "ems"  },
] as const;

function ServiceCards({ activePacks }: { activePacks: ActivePack[] }) {
  // Map active packs by service name keyword for quick lookup
  const packByKey = new Map<string, ActivePack>();
  for (const pack of activePacks) {
    const name = (pickFirst(pack.services)?.name ?? "").toLowerCase();
    if (name.includes("bike") || name.includes("infra")) packByKey.set("bike", pack);
    if (name.includes("ems")  || name.includes("sculpt")) packByKey.set("ems", pack);
  }

  return (
    <section>
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/40">
        Your services
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {FIXED_SERVICES.map(({ key, label, Icon, bookFilter }) => {
          const pack = packByKey.get(key);
          const used = pack ? pack.sessions_total - pack.sessions_remaining : null;
          return (
            <Link
              key={key}
              href={`/portal/book?filter=${bookFilter}`}
              className="group rounded-[14px] border border-sand bg-white p-3 transition-colors hover:border-sage/30 hover:bg-sand/10"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-sand/60 transition-colors group-hover:bg-sage/10">
                  <Icon size={15} strokeWidth={1.6} className="text-sage" />
                </div>
                {pack && (
                  <span className="text-[10px] font-semibold text-sage">
                    {pack.sessions_remaining} left
                  </span>
                )}
              </div>
              {pack ? (
                <>
                  <p className="text-[11px] text-olive/40">
                    {used} / {pack.sessions_total} sessions used
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium text-olive">{label}</p>
                  {/* Progress bar */}
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-sand/60">
                    <div
                      className="h-full rounded-full bg-sage"
                      style={{ width: `${Math.round(((used ?? 0) / pack.sessions_total) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-olive/40">Single sessions from</p>
                  <p className="mt-0.5 text-[13px] font-medium text-olive">{label}</p>
                  <p className="mt-1 text-[11px] font-medium text-sage">
                    {key === "bike" ? "£39 / session" : "£80 / session"}
                  </p>
                </>
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
    <div className="flex flex-col gap-5 p-4 md:flex-row md:p-6">
      <div className="flex flex-1 flex-col gap-5">
        <div className="h-[148px] animate-pulse rounded-[20px] bg-olive/10" />
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[90px] animate-pulse rounded-[14px] bg-sand/60"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[150px] animate-pulse rounded-[14px] bg-sand/60"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[185px] flex-col gap-4">
        <div className="h-[160px] animate-pulse rounded-[14px] bg-sand/60" />
        <div className="h-[100px] animate-pulse rounded-[14px] bg-sand/60" />
        <div className="h-[160px] animate-pulse rounded-[14px] bg-sand/60" />
      </div>
    </div>
  );
}
