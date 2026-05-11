"use client";

import useSWR from "swr";
import Link from "next/link";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { LoyaltyHeroCard } from "@/components/loyalty/LoyaltyHeroCard";
import { Card, SectionTitle } from "@/components/ui/card";
import { formatPoints } from "@/lib/utils";
import { RewardsGrid } from "./RewardsGrid";
import { GiftFriendPanel } from "./GiftFriendPanel";
import { SettingsSection } from "./SettingsSection";
import { ReferAFriend } from "./ReferAFriend";
import type { LoyaltyView } from "@/lib/portal/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RewardRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  cost_points: number;
  value_pence: number | null;
  percent_value: number | null;
  service_id: string | null;
  min_tier: string;
}

interface LedgerRow {
  id: string;
  delta_points: number;
  reason: string;
  display_label: string | null;
  created_at: string;
}

interface RawBooking {
  id: string;
  starts_at: string;
  status: string;
  service_id: string;
  staff_id: string | null;
  services:
    | { name: string; duration_min: number }
    | { name: string; duration_min: number }[]
    | null;
  staff:
    | { display_name: string; is_active: boolean }
    | { display_name: string; is_active: boolean }[]
    | null;
}

interface PastBooking {
  id: string;
  starts_at: string;
  service_id: string;
  service_name: string;
  duration_min: number;
  staff_id: string | null;
  staff_name: string | null;
  staff_active: boolean;
}

interface TenantData {
  name?: string;
  slug?: string | null;
  subdomain?: string | null;
  custom_domain?: string | null;
  referral_enabled?: boolean;
  referral_referrer_pence?: number;
  referral_referred_pence?: number;
}

interface ProfileData {
  full_name: string | null;
  marketing_opt_in: boolean;
  birth_date: string | null;
  preferred_start_hour: number | null;
  preferred_end_hour: number | null;
}

interface ReferralSummary {
  referralCode: string;
  total: number;
  converted: number;
  earnedPence: number;
}

interface MeData {
  clientId: string;
  tenantId: string;
  firstName: string;
  loyalty: LoyaltyView;
  ledger: LedgerRow[];
  rewards: RewardRow[];
  profile: ProfileData | null;
  tenant: TenantData | null;
  referralSummary: ReferralSummary;
  pastBookings: RawBooking[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MeClient() {
  const { data, isLoading } = useSWR<MeData>("/api/portal/me");

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-4 pb-8">
        <header className="mb-2 px-2 py-3">
          <div className="h-7 w-48 animate-pulse rounded-full bg-olive/20" />
        </header>
        <div className="mt-2 h-36 animate-pulse rounded-[20px] bg-sand/60" />
        <div className="mt-6 h-4 w-32 animate-pulse rounded-full bg-olive/15" />
        <div className="mt-3 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-[16px] bg-sand/50"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const { firstName, loyalty, ledger, rewards, profile, tenant, referralSummary, pastBookings } = data;

  // Normalize raw booking rows
  const normalizedBookings: PastBooking[] = pastBookings.map((b) => {
    const svc = Array.isArray(b.services) ? b.services[0] : b.services;
    const stf = Array.isArray(b.staff) ? b.staff[0] : b.staff;
    return {
      id: b.id,
      starts_at: b.starts_at,
      service_id: b.service_id,
      service_name: svc?.name ?? "Session",
      duration_min: svc?.duration_min ?? 30,
      staff_id: b.staff_id,
      staff_name: stf?.display_name ?? null,
      staff_active: stf?.is_active ?? false,
    };
  });

  const safeProfile: ProfileData = profile ?? {
    full_name: null,
    marketing_opt_in: false,
    birth_date: null,
    preferred_start_hour: null,
    preferred_end_hour: null,
  };

  const greeting = getGreeting();

  return (
    <div className="px-4 pt-4 pb-8">
      {/* Header */}
      <header className="mb-2 px-2 py-3">
        <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          {greeting},{" "}
          <span className="font-normal text-olive-soft">{firstName}</span>
        </h1>
      </header>

      {/* Loyalty hero */}
      <div className="mt-2">
        <LoyaltyHeroCard
          tier={loyalty.tier}
          currentPoints={loyalty.currentPoints}
          lifetimePoints={loyalty.lifetimePoints}
          memberSince={loyalty.memberSince}
          nextReward={loyalty.nextReward}
        />
      </div>

      {/* Recent sessions */}
      {normalizedBookings.length > 0 && (
        <>
          <SectionTitle title="Recent sessions" />
          <ul className="flex flex-col gap-2">
            {normalizedBookings.slice(0, 4).map((b) => (
              <li key={b.id}>
                <PastBookingRow row={b} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* How you've earned */}
      <SectionTitle title="How you've earned" />
      {ledger.length === 0 ? (
        <Card className="p-5">
          <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
            Your points will start landing here.
          </h3>
          <p className="mt-2 text-[13px] tracking-snug text-olive-soft">
            We&rsquo;ll start crediting points after your first completed session.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {ledger.map((row) => (
            <LedgerRowCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {/* Spend your points */}
      <SectionTitle title="Spend your points" />
      <RewardsGrid
        rewards={rewards}
        currentPoints={loyalty.currentPoints}
        clientTier={loyalty.tier}
      />

      {/* Gift a friend */}
      {loyalty.currentPoints >= 4000 && (
        <>
          <SectionTitle title="Gift a friend" />
          <GiftFriendPanel
            costPoints={
              rewards.find((r) => r.slug === "gift-friend-trial")?.cost_points ?? 4000
            }
          />
        </>
      )}

      {/* Refer a friend */}
      {tenant?.referral_enabled && (
        <>
          <SectionTitle title="Refer a friend" />
          <ReferAFriend
            referralCode={referralSummary.referralCode}
            total={referralSummary.total}
            converted={referralSummary.converted}
            earnedPence={referralSummary.earnedPence}
            referrerCreditPence={tenant.referral_referrer_pence ?? 1000}
            referredCreditPence={tenant.referral_referred_pence ?? 1000}
            tenantName={tenant.name ?? "us"}
            portalBookUrl={buildPortalUrl(tenant, "/portal/book")}
          />
        </>
      )}

      {/* Settings */}
      <SectionTitle title="Settings" />
      <SettingsSection
        initialFullName={safeProfile.full_name ?? ""}
        initialMarketingOptIn={safeProfile.marketing_opt_in ?? false}
        initialBirthDate={safeProfile.birth_date}
        initialPreferredStartHour={safeProfile.preferred_start_hour}
        initialPreferredEndHour={safeProfile.preferred_end_hour}
      />
    </div>
  );
}

// ─── Ledger row ───────────────────────────────────────────────────────────────

function LedgerRowCard({ row }: { row: LedgerRow }) {
  const positive = row.delta_points > 0;
  const sign = positive ? "+" : "−";
  const magnitude = formatPoints(Math.abs(row.delta_points));

  return (
    <Card className="flex items-center gap-4 p-4">
      <div
        className={`flex-shrink-0 font-serif text-[18px] font-medium tabular-nums tracking-tight ${
          positive ? "text-sage-deep" : "text-olive-soft"
        }`}
      >
        {sign}
        {magnitude}
      </div>
      <div className="flex-1 text-[14px] tracking-snug text-olive">
        {row.display_label ?? humaniseReason(row.reason)}
      </div>
      <div className="flex-shrink-0 text-[12px] tabular-nums text-olive-soft">
        {relativeDate(row.created_at)}
      </div>
    </Card>
  );
}

// ─── Past booking row ─────────────────────────────────────────────────────────

function PastBookingRow({ row }: { row: PastBooking }) {
  const date = format(new Date(row.starts_at), "d MMM yyyy");
  const params = new URLSearchParams({ source: "book_again" });
  if (row.staff_id && row.staff_active) {
    params.set("staff", row.staff_id);
  }
  const href = `/portal/book/${row.service_id}?${params.toString()}`;

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-olive">{row.service_name}</div>
        <div className="text-[12px] tracking-snug text-olive-soft">
          {date}
          {row.staff_name && ` · with ${row.staff_name}`} · {row.duration_min} min
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-sage/30 px-4 text-[13px] font-medium text-sage-deep transition-colors hover:border-sage hover:bg-sage/5"
      >
        Book again
      </Link>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function humaniseReason(reason: string): string {
  switch (reason) {
    case "welcome_bonus":               return "Welcome bonus";
    case "booking_completed":           return "Earned from a session";
    case "birthday_bonus":              return "Birthday bonus";
    case "review_5_star":              return "Review thank-you";
    case "referral_friend_signup":      return "A friend signed up";
    case "referral_friend_first_booking": return "A friend booked";
    case "session_log_added":           return "Session log added";
    case "streak_bonus":                return "Streak bonus";
    case "manual_credit":               return "Manual credit";
    case "redemption":                  return "Redeemed";
    case "expiry":                      return "Expired";
    case "manual_debit":                return "Manual debit";
    case "gifted_to_friend":            return "Gifted a trial";
    default:                            return reason;
  }
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (differenceInDays(new Date(), d) < 7) return formatDistanceToNow(d, { addSuffix: true });
  return format(d, "d MMM");
}

function buildPortalUrl(
  tenant: {
    custom_domain?: string | null;
    subdomain?: string | null;
    slug?: string | null;
  },
  path: string
): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}${path}`;
  if (tenant.subdomain) return `https://${tenant.subdomain}.atavoplatform.com${path}`;
  if (tenant.slug) return `https://${tenant.slug}.atavoplatform.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
