import Link from "next/link";
import { fromZonedTime } from "date-fns-tz";
import { startOfWeek, endOfWeek, getDay, format } from "date-fns";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatPoints } from "@/lib/utils";
import { getHomeBannerNotifications } from "@/lib/notifications/queries";
import { HomeBanners } from "./HomeBanners";

const TZ = "Europe/London";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function pct(a: number, b: number) {
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminTodayPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();
  const now = new Date();
  const tz = TZ;

  // ── Date bounds ──────────────────────────────────────────────────────────────
  const ymd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const dayStart = fromZonedTime(`${ymd}T00:00:00`, tz);
  const dayEnd   = fromZonedTime(`${ymd}T23:59:59.999`, tz);

  // Week bounds (Mon → Sun)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(new Date(weekStart.getTime() - 86_400_000), { weekStartsOn: 1 });
  const lastWeekEnd   = endOfWeek(new Date(weekStart.getTime() - 86_400_000),   { weekStartsOn: 1 });

  // ── Parallel fetches ─────────────────────────────────────────────────────────
  const [
    todayBookingsResult,
    topUnreadResult,
    innerCircleResult,
    clientCountResult,
    weekBookingsResult,
    lastWeekBookingsResult,
    banners,
  ] = await Promise.all([
    // Today's bookings — full detail
    supabase
      .from("bookings")
      .select(
        "id, starts_at, status, price_pence, " +
        "services (name), " +
        "staff!bookings_staff_id_fkey (display_name), " +
        "clients (full_name, email)"
      )
      .eq("tenant_id", ctx.tenantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true }),

    // Top 3 unread threads with client preview
    supabase
      .from("chat_threads")
      .select("id, last_message_preview, unread_count_staff, clients (full_name, email)")
      .eq("tenant_id", ctx.tenantId)
      .gt("unread_count_staff", 0)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(3),

    // Inner Circle members
    supabase
      .from("loyalty_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("tier", "inner_circle"),

    // Total active clients
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true),

    // This week's bookings (for revenue bar chart)
    supabase
      .from("bookings")
      .select("starts_at, price_pence")
      .eq("tenant_id", ctx.tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("starts_at", weekStart.toISOString())
      .lte("starts_at", weekEnd.toISOString()),

    // Last week total
    supabase
      .from("bookings")
      .select("price_pence")
      .eq("tenant_id", ctx.tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("starts_at", lastWeekStart.toISOString())
      .lte("starts_at", lastWeekEnd.toISOString()),

    getHomeBannerNotifications().catch(() => []),
  ]);

  // ── Shape data ───────────────────────────────────────────────────────────────

  type Booking = {
    id: string;
    starts_at: string;
    status: string;
    price_pence: number | null;
    services: unknown;
    staff: unknown;
    clients: unknown;
  };

  const todayBookings = ((todayBookingsResult.data ?? []) as unknown) as Booking[];
  const completedToday = todayBookings.filter((b) => b.status === "completed").length;
  const totalToday = todayBookings.length;

  // Next upcoming booking (starts_at > now, or first of day if all past)
  const nextBooking =
    todayBookings.find((b) => new Date(b.starts_at) > now && b.status !== "cancelled") ??
    todayBookings[0] ?? null;

  // Staff breakdown for today
  const staffTally = new Map<string, number>();
  for (const b of todayBookings) {
    if (b.status === "cancelled") continue;
    const s = pickFirst<{ display_name: string }>(b.staff);
    const name = s?.display_name ?? "Unknown";
    staffTally.set(name, (staffTally.get(name) ?? 0) + 1);
  }
  const staffRows = [...staffTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Revenue bar chart — group by weekday index (0=Mon…6=Sun)
  // getDay returns 0=Sun, so we remap: Mon=0…Sun=6
  const dayTotals: number[] = Array(7).fill(0);
  for (const b of (weekBookingsResult.data ?? []) as Array<{ starts_at: string; price_pence: number | null }>) {
    const raw = getDay(new Date(b.starts_at)); // 0=Sun
    const idx = raw === 0 ? 6 : raw - 1;       // remap to Mon=0…Sun=6
    dayTotals[idx] += b.price_pence ?? 0;
  }
  const thisWeekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const lastWeekTotal = ((lastWeekBookingsResult.data ?? []) as Array<{ price_pence: number | null }>)
    .reduce((acc, row) => acc + (row.price_pence ?? 0), 0);
  const weekTrend = pct(thisWeekTotal, lastWeekTotal);
  const maxDayRevenue = Math.max(...dayTotals, 1);
  const todayDayIdx = (() => { const d = getDay(now); return d === 0 ? 6 : d - 1; })();

  // Unread messages
  type Thread = { id: string; last_message_preview: string | null; unread_count_staff: number | null; clients: unknown };
  const topUnread = (topUnreadResult.data ?? []) as Thread[];
  const unreadCount = topUnread.reduce((acc, t) => acc + (t.unread_count_staff ?? 0), 0);

  const innerCircleCount = innerCircleResult.count ?? 0;
  const clientCount = clientCountResult.count ?? 0;

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  // Bank holiday banners
  const horizonYmd = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const todayYmd = new Date().toISOString().slice(0, 10);
  const { data: bhPending } = await supabase
    .from("bank_holiday_decisions")
    .select("id, date, name")
    .eq("tenant_id", ctx.tenantId)
    .eq("decision", "pending")
    .gte("date", todayYmd)
    .lte("date", horizonYmd)
    .order("date", { ascending: true })
    .limit(3);

  const bankHolidayBanners = ((bhPending ?? []) as Array<{ id: string; date: string; name: string }>).map((b) => {
    const days = Math.max(0, Math.ceil((new Date(`${b.date}T00:00:00`).getTime() - Date.now()) / 86_400_000));
    return {
      id: `bh:${b.id}`,
      kind: "bank_holiday_reminder",
      title: `${b.name} is in ${days} day${days === 1 ? "" : "s"} — no decision yet`,
      body: "Decide now so the booking page reflects it.",
      actionUrl: "/admin/settings?tab=schedule",
      priority: days <= 14 ? "urgent" : "high",
    };
  });

  // ── Ring SVG values ──────────────────────────────────────────────────────────
  const ringR = 36;
  const ringC = 2 * Math.PI * ringR; // circumference ≈ 226
  const ringProgress = totalToday > 0 ? completedToday / totalToday : 0;
  const ringDash = ringC * ringProgress;
  const ringOffset = ringC - ringDash;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
            {getGreeting()}, {ctx.staffName ?? "team"}.
          </h1>
          <p className="mt-0.5 text-[12px] text-olive/45">
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz })}
          </p>
        </div>
        {/* Top KPIs */}
        <div className="flex items-end gap-8">
          <TopKpi label="Clients" value={String(clientCount)} href="/admin/clients" />
          <TopKpi label="Today" value={String(totalToday)} href="/admin/bookings" />
          <TopKpi label="This week" value={formatGBP(thisWeekTotal)} href="/admin/finance" />
        </div>
      </header>

      {/* ── Banners ──────────────────────────────────────────────────────────── */}
      {(banners.length > 0 || bankHolidayBanners.length > 0) && (
        <HomeBanners
          items={[
            ...banners.map((b) => ({
              id: b.id, kind: b.kind, title: b.title,
              body: b.body, actionUrl: b.actionUrl, priority: b.priority,
            })),
            ...bankHolidayBanners,
          ]}
        />
      )}

      {/* ── Row 1: 4-column grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">

        {/* Next up — dark card */}
        <div className="rounded-[20px] bg-olive p-5 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream/45">
            Next up
          </p>
          {nextBooking ? (
            <Link href={`/admin/bookings?focus=${nextBooking.id}`} className="flex flex-col flex-1 mt-3">
              {(() => {
                const client = pickFirst<{ full_name: string | null; email: string | null }>(nextBooking.clients);
                const service = pickFirst<{ name: string }>(nextBooking.services);
                const staff = pickFirst<{ display_name: string }>(nextBooking.staff);
                const name = client?.full_name ?? client?.email ?? "—";
                const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                const time = new Date(nextBooking.starts_at).toLocaleTimeString("en-GB", {
                  hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
                }).replace(/\s+/g, "").toLowerCase();
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-light text-[13px] font-semibold text-olive">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-cream">{name}</p>
                        <p className="mt-0.5 text-[11px] text-cream/50">{service?.name ?? "Session"}</p>
                      </div>
                    </div>
                    <p className="mt-auto pt-4 font-serif text-[32px] font-medium leading-none tracking-tight text-sage-light">
                      {time}
                    </p>
                    <p className="mt-1.5 text-[10px] text-cream/40">
                      with {staff?.display_name ?? "—"}
                    </p>
                    <StatusPill status={nextBooking.status} dark />
                  </>
                );
              })()}
            </Link>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center">
              <p className="text-center text-[13px] text-cream/40">No bookings today.</p>
            </div>
          )}
        </div>

        {/* Revenue bar chart — light card */}
        <div className="rounded-[20px] bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/45">
                Revenue this week
              </p>
              <p className="mt-1 font-serif text-[28px] font-medium leading-none tracking-tight text-olive">
                {formatGBP(thisWeekTotal)}
              </p>
            </div>
            {weekTrend !== null && (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: weekTrend >= 0 ? "rgba(117,133,100,0.12)" : "rgba(212,91,91,0.10)",
                  color: weekTrend >= 0 ? "#5C6B4E" : "#D45B5B",
                }}
              >
                {weekTrend >= 0 ? "+" : ""}{weekTrend}%
              </span>
            )}
          </div>

          {/* Bars */}
          <div className="mt-4 flex items-end gap-1.5" style={{ height: 56 }}>
            {dayTotals.map((total, i) => {
              const barH = Math.max(4, Math.round((total / maxDayRevenue) * 52));
              const isToday = i === todayDayIdx;
              const isFuture = i > todayDayIdx;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: barH,
                      background: isToday ? "#758564" : isFuture ? "#DED2C3" : "#DED2C3",
                      opacity: isFuture ? 0.35 : 1,
                    }}
                  />
                  <span
                    className="text-[9px]"
                    style={{
                      color: isToday ? "#758564" : "#3E3E31",
                      opacity: isToday ? 1 : 0.4,
                      fontWeight: isToday ? 600 : 400,
                    }}
                  >
                    {dayLabels[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* vs last week */}
          <div className="mt-3 flex items-center justify-between border-t border-olive/[0.07] pt-3">
            <div>
              <p className="text-[10px] text-olive/40">Last week</p>
              <p className="mt-0.5 text-[13px] text-olive/60">{formatGBP(lastWeekTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-olive/40">Inner Circle</p>
              <p className="mt-0.5 text-[13px] text-olive/60">{formatPoints(innerCircleCount)} members</p>
            </div>
          </div>
        </div>

        {/* Sessions ring — light card */}
        <div className="rounded-[20px] bg-white p-5 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/45">
            Today&rsquo;s sessions
          </p>
          {/* Ring */}
          <div className="flex flex-1 flex-col items-center justify-center py-2">
            <svg width="96" height="96" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r={ringR} fill="none" stroke="#DED2C3" strokeWidth="8" />
              <circle
                cx="45" cy="45" r={ringR}
                fill="none"
                stroke="#758564"
                strokeWidth="8"
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
              />
              <text x="45" y="42" textAnchor="middle" fontFamily="Georgia,serif" fontSize="18" fontWeight="600" fill="#3E3E31">
                {completedToday}/{totalToday}
              </text>
              <text x="45" y="56" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="9" fill="#3E3E31" opacity="0.45">
                done
              </text>
            </svg>
          </div>
          {/* Staff breakdown */}
          <div className="mt-auto space-y-1.5 border-t border-olive/[0.07] pt-3">
            {staffRows.length === 0 ? (
              <p className="text-center text-[11px] text-olive/40">No sessions</p>
            ) : (
              staffRows.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[12px] text-olive/60">{name}</span>
                  <span className="text-[12px] font-medium text-olive">
                    {count} session{count !== 1 ? "s" : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unread messages — sage card */}
        <Link href="/admin/inbox" className="block focus-visible:outline-none">
          <div className="h-full rounded-[20px] p-5 flex flex-col" style={{ background: "#758564" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream/50">
              Unread messages
            </p>
            <p className="mt-1 font-serif text-[42px] font-medium leading-none tracking-tight text-cream">
              {unreadCount}
            </p>
            <div className="mt-4 flex flex-1 flex-col gap-2">
              {topUnread.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-[12px] text-cream/40">All caught up ✦</p>
                </div>
              ) : (
                topUnread.map((t) => {
                  const c = pickFirst<{ full_name: string | null; email: string | null }>(t.clients);
                  const name = c?.full_name ?? c?.email ?? "Client";
                  return (
                    <div
                      key={t.id}
                      className="rounded-[10px] p-2.5"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      <p className="text-[11px] font-medium text-cream/90">{name}</p>
                      {t.last_message_preview && (
                        <p className="mt-0.5 truncate text-[10px] text-cream/50">
                          {t.last_message_preview}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* ── Row 2: schedule + quick stats ───────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">

        {/* Today's schedule — dark card, spans 3 cols */}
        <div className="col-span-3 rounded-[20px] bg-olive p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream/45">
              Today&rsquo;s schedule
            </p>
            <span className="text-[11px] text-sage-light">
              {totalToday} session{totalToday !== 1 ? "s" : ""}
            </span>
          </div>

          {todayBookings.length === 0 ? (
            <p className="mt-6 text-center text-[13px] text-cream/35">No bookings today. Catch your breath.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {todayBookings.map((b) => {
                const service = pickFirst<{ name: string }>(b.services);
                const staff   = pickFirst<{ display_name: string }>(b.staff);
                const client  = pickFirst<{ full_name: string | null; email: string | null }>(b.clients);
                const name    = client?.full_name ?? client?.email ?? "—";
                const time    = new Date(b.starts_at).toLocaleTimeString("en-GB", {
                  hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
                }).replace(/\s+/g, "").toLowerCase();
                const isPast  = new Date(b.starts_at) < now;
                return (
                  <li key={b.id}>
                    <Link
                      href={`/admin/bookings?focus=${b.id}`}
                      className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-white/5"
                      style={{ opacity: isPast && b.status !== "completed" ? 0.5 : 1 }}
                    >
                      {/* Dot */}
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: b.status === "completed" ? "#BBC4AA"
                            : b.status === "confirmed" ? "#BBC4AA"
                            : b.status === "cancelled" ? "#D45B5B"
                            : "#DED2C3",
                          opacity: b.status === "pending" ? 0.5 : 1,
                        }}
                      />
                      {/* Time */}
                      <span className="w-14 shrink-0 text-[13px] font-medium tabular-nums text-cream/80">
                        {time}
                      </span>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-cream/90">{name}</p>
                        <p className="mt-0.5 text-[11px] text-cream/45">
                          {service?.name ?? "Session"} · {staff?.display_name ?? "—"}
                        </p>
                      </div>
                      {/* Status pill */}
                      <StatusPill status={b.status} dark />
                      {/* Price */}
                      {b.price_pence ? (
                        <span className="shrink-0 text-[12px] tabular-nums text-cream/40">
                          {formatGBP(b.price_pence)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick stats — light card, spans 2 cols */}
        <div className="col-span-2 flex flex-col gap-3">
          {/* Clients stat */}
          <Link href="/admin/clients" className="block focus-visible:outline-none">
            <div className="rounded-[20px] bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/45">Active clients</p>
              <p className="mt-1 font-serif text-[36px] font-medium leading-none tracking-tight text-olive">
                {clientCount}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-olive/[0.07] pt-3">
                <div>
                  <p className="text-[10px] text-olive/40">Inner Circle</p>
                  <p className="mt-0.5 text-[14px] font-medium text-olive">{innerCircleCount}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-olive/40">Today's revenue</p>
                  <p className="mt-0.5 text-[14px] font-medium text-sage-deep">
                    {formatGBP(
                      todayBookings
                        .filter((b) => b.status === "completed" || b.status === "confirmed")
                        .reduce((acc, b) => acc + (b.price_pence ?? 0), 0)
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Link>

          {/* Quick links */}
          <div className="rounded-[20px] bg-white p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/45">Quick actions</p>
            <div className="mt-3 flex flex-col gap-2">
              {[
                { label: "New booking",    href: "/admin/bookings",  icon: "+" },
                { label: "View analytics", href: "/admin/analytics", icon: "↗" },
                { label: "Flash deal",     href: "/admin/flash",     icon: "⚡" },
                { label: "Finance report", href: "/admin/finance",   icon: "£" },
              ].map(({ label, href, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium text-olive transition-colors hover:bg-olive/5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand/60 text-[12px] text-olive/60">
                    {icon}
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, dark = false }: { status: string; dark?: boolean }) {
  const palette: Record<string, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
    confirmed: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E", darkBg: "rgba(187,196,170,0.15)", darkFg: "#BBC4AA" },
    pending:   { bg: "rgba(184,148,90,0.10)",  fg: "#B8945A", darkBg: "rgba(222,210,195,0.15)", darkFg: "#DED2C3" },
    completed: { bg: "rgba(117,133,100,0.16)", fg: "#3E3E31", darkBg: "rgba(187,196,170,0.20)", darkFg: "#BBC4AA" },
    cancelled: { bg: "rgba(212,91,91,0.10)",   fg: "#D45B5B", darkBg: "rgba(212,91,91,0.15)",   darkFg: "#EF9F9F" },
    no_show:   { bg: "rgba(212,91,91,0.10)",   fg: "#D45B5B", darkBg: "rgba(212,91,91,0.15)",   darkFg: "#EF9F9F" },
  };
  const c = palette[status] ?? { bg: "rgba(62,62,49,0.06)", fg: "#3E3E31", darkBg: "rgba(255,255,255,0.10)", darkFg: "#F6F3EE" };
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ background: dark ? c.darkBg : c.bg, color: dark ? c.darkFg : c.fg }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Top KPI ──────────────────────────────────────────────────────────────────

function TopKpi({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="block text-right focus-visible:outline-none">
      <p className="font-serif text-[32px] font-medium leading-none tracking-tight text-olive tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-olive/40">
        {label}
      </p>
    </Link>
  );
}
