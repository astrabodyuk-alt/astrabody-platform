import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatPoints } from "@/lib/utils";
import { DoublePointsToggle } from "./DoublePointsToggle";
import { ReferralProgrammeForm } from "./ReferralProgrammeForm";

/**
 * /admin/loyalty — KPIs + Double Points week toggle.
 *
 * V1 ships the metrics that map cleanly to existing schema:
 *   - Active members  = clients with at least one ledger row in the last 90 days
 *   - Members per tier (friend / insider / inner_circle)
 *   - Referrals per active member, current quarter
 *
 * Two metrics from Astrabody_Loyalty_Strategy.md §11 still need
 * server-side instrumentation we haven't built:
 *   - Expiry-nudge redemption rate (needs the cron + nudge tracking)
 *   - 30-day churn after Inner Circle entry
 * They render as "—" with a TODO note. Coming with Prompt 10.
 */
export default async function AdminLoyaltyPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();

  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();
  const quarterStart = (() => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3, 1).toISOString();
  })();

  const [
    tenantResult,
    activeMembersResult,
    tierBreakdown,
    referralsThisQuarter,
  ] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "loyalty_double_points_until, referral_enabled, referral_referrer_pence, referral_referred_pence, referral_min_booking_pence"
      )
      .eq("id", ctx.tenantId)
      .maybeSingle(),
    supabase
      .from("loyalty_ledger")
      .select("client_id", { count: "exact" })
      .eq("tenant_id", ctx.tenantId)
      .gte("created_at", ninetyDaysAgo),
    supabase
      .from("loyalty_accounts")
      .select("tier")
      .eq("tenant_id", ctx.tenantId),
    supabase
      .from("loyalty_referrals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .gte("created_at", quarterStart),
  ]);

  // Distinct active members.
  const activeMembers = new Set(
    ((activeMembersResult.data ?? []) as Array<{ client_id: string }>).map(
      (r) => r.client_id
    )
  ).size;

  const tiers = ((tierBreakdown.data ?? []) as Array<{ tier: string }>).reduce<
    Record<string, number>
  >((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1;
    return acc;
  }, {});

  const totalMembers = (tierBreakdown.data ?? []).length;
  const referralCount = referralsThisQuarter.count ?? 0;
  const referralsPerActive =
    activeMembers > 0 ? (referralCount / activeMembers).toFixed(2) : "0.00";

  const doubleUntil = (tenantResult.data?.loyalty_double_points_until as string | null) ?? null;
  const doubleActive = !!doubleUntil && new Date(doubleUntil).getTime() > Date.now();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Loyalty
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          The Inner Circle in numbers.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active members"
          value={formatPoints(activeMembers)}
          sub="last 90 days"
        />
        <KpiCard
          label="Total members"
          value={formatPoints(totalMembers)}
          sub="all time"
        />
        <KpiCard
          label="Referrals"
          value={formatPoints(referralCount)}
          sub="this quarter"
        />
        <KpiCard
          label="Referrals / active"
          value={referralsPerActive}
          sub="this quarter"
        />
      </div>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Tier breakdown
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TierCard
            tier="friend"
            label="Friend"
            count={tiers.friend ?? 0}
            total={totalMembers}
          />
          <TierCard
            tier="insider"
            label="Insider"
            count={tiers.insider ?? 0}
            total={totalMembers}
          />
          <TierCard
            tier="inner_circle"
            label="Inner Circle"
            count={tiers.inner_circle ?? 0}
            total={totalMembers}
          />
        </div>
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Double Points week
        </h2>
        <Card className="mt-3 flex flex-col gap-3 p-5">
          <p className="text-[14px] tracking-snug text-olive">
            Run a Double Points week when you want to push retention. Once
            enabled, every completed booking credits 2× the usual rate
            until the end-of-week timestamp.
          </p>
          <p className="text-[12px] tracking-snug text-olive-faint">
            TODO: the doubling math is set on the tenant row. Wiring it
            into <code>loyalty_credit_booking()</code> is a follow-up.
          </p>
          <DoublePointsToggle
            initialActive={doubleActive}
            initialUntil={doubleUntil}
            disabled={!ctx.isOwnerOrAdmin}
          />
        </Card>
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Referral programme
        </h2>
        <Card className="mt-3 p-5">
          <ReferralProgrammeForm
            initial={{
              enabled:
                ((tenantResult.data as { referral_enabled?: boolean } | null)
                  ?.referral_enabled as boolean | undefined) ?? false,
              referrerPence:
                ((tenantResult.data as { referral_referrer_pence?: number } | null)
                  ?.referral_referrer_pence as number | undefined) ?? 1000,
              referredPence:
                ((tenantResult.data as { referral_referred_pence?: number } | null)
                  ?.referral_referred_pence as number | undefined) ?? 1000,
              minBookingPence:
                ((tenantResult.data as {
                  referral_min_booking_pence?: number;
                } | null)?.referral_min_booking_pence as number | undefined) ?? 0,
            }}
            disabled={!ctx.isOwnerOrAdmin}
          />
        </Card>
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Pending instrumentation
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <KpiCard
            label="Expiry-nudge redemption rate"
            value="—"
            sub="needs cron tracking (Prompt 10)"
          />
          <KpiCard
            label="30-day churn after Inner Circle"
            value="—"
            sub="needs cohort table (Prompt 10)"
          />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[32px] font-medium leading-none tracking-tightest tabular-nums text-olive">
        {value}
      </p>
      {sub && (
        <p className="mt-2 text-[11px] tracking-snug text-olive-faint">{sub}</p>
      )}
    </Card>
  );
}

function TierCard({
  tier,
  label,
  count,
  total,
}: {
  tier: string;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[28px] font-medium leading-none tabular-nums text-olive">
        {formatPoints(count)}
      </p>
      <p className="mt-2 text-[12px] tabular-nums text-olive-soft">
        {pct}% of total
      </p>
    </Card>
  );
}
