import Link from "next/link";
import { redirect } from "next/navigation";
import { LoyaltyHeroCard } from "@/components/loyalty/LoyaltyHeroCard";
import { Card, SectionTitle } from "@/components/ui/card";
import {
  getCurrentClient,
  getLoyaltyAccount,
} from "@/lib/portal/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatPoints } from "@/lib/utils";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { RewardsGrid } from "./RewardsGrid";
import { GiftFriendPanel } from "./GiftFriendPanel";
import { SettingsSection } from "./SettingsSection";
import { ReferAFriend } from "./ReferAFriend";
import { getReferralSummary } from "@/lib/referrals/queries";

/**
 * /portal/me — the rewards home and identity page.
 *
 * Server component. Fetches everything in parallel and hands shaped
 * data to client subcomponents (RewardsGrid, GiftFriendPanel,
 * SettingsSection). The ledger list and the LoyaltyHeroCard are
 * server-rendered.
 */
export default async function PortalMePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  const supabase = await createServerSupabase();
  const [
    loyalty,
    ledgerResult,
    rewardsResult,
    profileResult,
    tenantResult,
    referralSummary,
    pastBookingsResult,
  ] = await Promise.all([
      getLoyaltyAccount(me.id),
      supabase
        .from("loyalty_ledger")
        .select("id, delta_points, reason, display_label, created_at")
        .eq("client_id", me.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("loyalty_rewards")
        .select(
          "id, slug, name, description, kind, cost_points, value_pence, percent_value, service_id, min_tier"
        )
        .eq("tenant_id", me.tenant_id)
        .eq("is_active", true)
        .order("cost_points", { ascending: true }),
      supabase
        .from("clients")
        .select("full_name, marketing_opt_in, birth_date, preferred_start_hour, preferred_end_hour")
        .eq("id", me.id)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select(
          "name, slug, subdomain, custom_domain, referral_enabled, referral_referrer_pence, referral_referred_pence"
        )
        .eq("id", me.tenant_id)
        .maybeSingle(),
      getReferralSummary(me.id, me.tenant_id),
      supabase
        .from("bookings")
        .select(
          "id, starts_at, status, service_id, staff_id, " +
            "services (name, duration_min), " +
            "staff:staff_id (display_name, is_active)"
        )
        .eq("client_id", me.id)
        .in("status", ["completed", "confirmed"])
        .lt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: false })
        .limit(8),
    ]);

  const ledger = (ledgerResult.data ?? []) as Array<{
    id: string;
    delta_points: number;
    reason: string;
    display_label: string | null;
    created_at: string;
  }>;
  const rewards = (rewardsResult.data ?? []) as RewardRow[];
  const profile = (profileResult.data ?? {
    full_name: null,
    marketing_opt_in: false,
    birth_date: null,
    preferred_start_hour: null,
    preferred_end_hour: null,
  }) as {
    full_name: string | null;
    marketing_opt_in: boolean;
    birth_date: string | null;
    preferred_start_hour: number | null;
    preferred_end_hour: number | null;
  };

  const pastBookings = ((pastBookingsResult.data ?? []) as unknown as Array<{
    id: string;
    starts_at: string;
    status: string;
    service_id: string;
    staff_id: string | null;
    services: { name: string; duration_min: number } | { name: string; duration_min: number }[] | null;
    staff:
      | { display_name: string; is_active: boolean }
      | { display_name: string; is_active: boolean }[]
      | null;
  }>).map((b) => {
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

  const greeting = getGreeting();

  return (
    <div className="px-4 pt-4 pb-8">
      {/* Header — same shape as /portal home */}
      <header className="mb-2 flex items-center justify-between px-2 py-3">
        <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          {greeting},{" "}
          <span className="font-normal text-olive-soft">{me.firstName}</span>
        </h1>
        <Avatar initials={me.initials} />
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

      {/* Recent sessions — quick book-again shortcuts */}
      {pastBookings.length > 0 && (
        <>
          <SectionTitle title="Recent sessions" />
          <ul className="flex flex-col gap-2">
            {pastBookings.slice(0, 4).map((b) => (
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
            We&rsquo;ll start crediting points after your first completed
            session.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {ledger.map((row) => (
            <LedgerRow key={row.id} row={row} />
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

      {/* Gift a friend — only when balance >= 4000 */}
      {loyalty.currentPoints >= 4000 && (
        <>
          <SectionTitle title="Gift a friend" />
          <GiftFriendPanel
            costPoints={
              rewards.find((r) => r.slug === "gift-friend-trial")?.cost_points ??
              4000
            }
          />
        </>
      )}

      {/* Refer a friend — only when the tenant has the programme on */}
      {tenantResult.data &&
        (tenantResult.data as { referral_enabled?: boolean }).referral_enabled && (
          <>
            <SectionTitle title="Refer a friend" />
            <ReferAFriend
              referralCode={referralSummary.referralCode}
              total={referralSummary.total}
              converted={referralSummary.converted}
              earnedPence={referralSummary.earnedPence}
              referrerCreditPence={
                ((tenantResult.data as { referral_referrer_pence?: number })
                  .referral_referrer_pence as number | undefined) ?? 1000
              }
              referredCreditPence={
                ((tenantResult.data as { referral_referred_pence?: number })
                  .referral_referred_pence as number | undefined) ?? 1000
              }
              tenantName={
                ((tenantResult.data as { name?: string }).name as string | undefined) ??
                "us"
              }
              portalBookUrl={buildPortalUrl(
                tenantResult.data as {
                  custom_domain?: string | null;
                  subdomain?: string | null;
                  slug?: string | null;
                },
                "/portal/book"
              )}
            />
          </>
        )}

      {/* Settings */}
      <SectionTitle title="Settings" />
      <SettingsSection
        initialFullName={profile.full_name ?? ""}
        initialMarketingOptIn={profile.marketing_opt_in ?? false}
        initialBirthDate={profile.birth_date}
        initialPreferredStartHour={profile.preferred_start_hour}
        initialPreferredEndHour={profile.preferred_end_hour}
      />
    </div>
  );
}

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

function LedgerRow({
  row,
}: {
  row: {
    id: string;
    delta_points: number;
    reason: string;
    display_label: string | null;
    created_at: string;
  };
}) {
  const positive = row.delta_points > 0;
  const sign = positive ? "+" : "−"; // real minus, not hyphen
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

function humaniseReason(reason: string): string {
  switch (reason) {
    case "welcome_bonus":
      return "Welcome bonus";
    case "booking_completed":
      return "Earned from a session";
    case "birthday_bonus":
      return "Birthday bonus";
    case "review_5_star":
      return "Review thank-you";
    case "referral_friend_signup":
      return "A friend signed up";
    case "referral_friend_first_booking":
      return "A friend booked";
    case "session_log_added":
      return "Session log added";
    case "streak_bonus":
      return "Streak bonus";
    case "manual_credit":
      return "Manual credit";
    case "redemption":
      return "Redeemed";
    case "expiry":
      return "Expired";
    case "manual_debit":
      return "Manual debit";
    case "gifted_to_friend":
      return "Gifted a trial";
    default:
      return reason;
  }
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (differenceInDays(new Date(), d) < 7) {
    return formatDistanceToNow(d, { addSuffix: true });
  }
  return format(d, "d MMM");
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium tracking-snug text-cream"
      style={{
        background: "linear-gradient(135deg, #758564, #5C6B4E)",
      }}
      aria-label="Account"
    >
      {initials}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

interface PastBookingRowProps {
  row: {
    id: string;
    starts_at: string;
    service_id: string;
    service_name: string;
    duration_min: number;
    staff_id: string | null;
    staff_name: string | null;
    staff_active: boolean;
  };
}

function PastBookingRow({ row }: PastBookingRowProps) {
  const date = format(new Date(row.starts_at), "d MMM yyyy");
  // Only carry the staff into Book again if they're still active.
  const params = new URLSearchParams({ source: "book_again" });
  if (row.staff_id && row.staff_active) {
    params.set("staff", row.staff_id);
  }
  const href = `/portal/book/${row.service_id}?${params.toString()}`;

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-olive">
          {row.service_name}
        </div>
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
