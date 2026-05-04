import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import {
  getKpiBundle,
  getFunnel,
  getRetentionHeatmap,
  getTopServices,
  getTopClients,
  getWinBackCandidates,
  resolvePeriod,
  type AnalyticsPeriod,
} from "@/lib/analytics/queries";
import { PeriodTabs } from "./PeriodTabs";
import { KpiRow } from "./KpiRow";
import { LifecycleFunnel } from "./LifecycleFunnel";
import { RetentionHeatmap } from "./RetentionHeatmap";
import { TopServicesCard } from "./TopServicesCard";
import { TopClientsCard } from "./TopClientsCard";
import { WinBackTable } from "./WinBackTable";

const ALLOWED_PERIODS: ReadonlySet<string> = new Set([
  "30d",
  "90d",
  "ytd",
  "all",
]);

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  if (!ctx.isOwnerOrAdmin) redirect("/admin");

  const { period: periodParam } = await searchParams;
  const period: AnalyticsPeriod =
    periodParam && ALLOWED_PERIODS.has(periodParam)
      ? (periodParam as AnalyticsPeriod)
      : "30d";
  const window = resolvePeriod(period);

  const [
    kpis,
    funnel,
    heatmap,
    topServices,
    topClients,
    winBack,
  ] = await Promise.all([
    getKpiBundle(ctx.tenantId, window),
    getFunnel(ctx.tenantId, window),
    getRetentionHeatmap(ctx.tenantId),
    getTopServices(ctx.tenantId, window),
    getTopClients(ctx.tenantId, window),
    getWinBackCandidates(ctx.tenantId),
  ]);

  const winBackTotal = winBack.reduce(
    (acc, r) => acc + r.totalSpentPence,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Analytics
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Where the studio stands and where to push next. {window.label}.
        </p>
      </header>

      <PeriodTabs current={period} />

      <KpiRow kpis={kpis} />

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Client lifecycle
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          How new clients move from sign-up to active regulars.
        </p>
        <LifecycleFunnel funnel={funnel} period={window} />
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Retention heatmap
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Completed sessions per day, last 12 weeks.
        </p>
        <Card className="mt-4 p-5">
          <RetentionHeatmap data={heatmap} />
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopServicesCard rows={topServices} />
        <TopClientsCard rows={topClients} />
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Win-back candidates
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {winBack.length === 0
            ? "Nobody's lapsed past the 60-day mark — clean slate."
            : `${winBack.length} client${winBack.length === 1 ? "" : "s"} haven't visited in 60+ days. Combined lifetime value: ${formatPence(winBackTotal)}.`}
        </p>
        <div className="mt-4">
          <WinBackTable rows={winBack} />
        </div>
      </section>
    </div>
  );
}

function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}
