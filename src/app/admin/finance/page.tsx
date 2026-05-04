import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import {
  getFinanceKpis,
  getMonthlyRevenueSeries,
  getTenantVatSettings,
} from "@/lib/finance/queries";
import { getCachedCoachRecommendations } from "@/lib/coach/generator";
import { formatGBP } from "@/lib/utils";
import { RevenueChart } from "./RevenueChart";
import { ExportCard } from "./ExportCard";
import { CoachCard } from "./CoachCard";

/**
 * /admin/finance — owner-only.
 *
 *   Top:    4 KPIs (revenue this month, VAT collected, vs last month,
 *           vs same month last year)
 *   Middle: 12-month revenue chart (TTC + ex-VAT lines)
 *   Bottom: Export card (PDF/CSV) + AI coach card (Suspense)
 *
 * The coach card is deferred via Suspense so the page renders KPIs +
 * chart + export immediately, even on the first visit when no cache
 * exists. The coach component itself renders a sage shimmer until the
 * cached or freshly-generated recommendation resolves.
 */
export default async function AdminFinancePage() {
  const ctx = await getAdminContextOrRedirect();
  if (ctx.role !== "owner") redirect("/admin");

  const vat = await getTenantVatSettings(ctx.tenantId);
  const [kpis, series] = await Promise.all([
    getFinanceKpis(ctx.tenantId, vat),
    getMonthlyRevenueSeries(ctx.tenantId, vat),
  ]);

  const monthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    timeZone: "Europe/London",
  });

  // Pull whatever's already cached so the Suspense fallback does NOT
  // generate on first render. The CoachCard kicks off generation
  // client-side if the cache is empty.
  const cached = await getCachedCoachRecommendations(ctx.tenantId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Finance
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Real-time revenue, VAT, and your monthly action plan.
          {vat.registered ? ` VAT ${vat.ratePct}%.` : " Not VAT-registered."}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`Revenue (${monthLabel})`}
          value={formatGBP(kpis.thisMonth.ttcPence)}
          subtitle={
            vat.registered
              ? `${formatGBP(kpis.thisMonth.exVatPence)} ex-VAT`
              : `${kpis.thisMonth.count} sale${kpis.thisMonth.count === 1 ? "" : "s"}`
          }
        />
        {vat.registered && (
          <KpiCard
            label="VAT collected"
            value={formatGBP(kpis.thisMonth.vatPence)}
            subtitle={`At ${vat.ratePct}%`}
          />
        )}
        <DeltaCard
          label="vs last month"
          current={kpis.thisMonth.ttcPence}
          previous={kpis.lastMonth.ttcPence}
        />
        {kpis.hasYearOfHistory ? (
          <DeltaCard
            label="vs same month last year"
            current={kpis.thisMonth.ttcPence}
            previous={kpis.sameMonthLastYear?.ttcPence ?? 0}
          />
        ) : (
          <KpiCard
            label="vs last year"
            value="—"
            subtitle="< 12 months of data"
          />
        )}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
            Last 12 months
          </h2>
          <span className="text-[12px] tracking-snug text-olive-soft">
            {vat.registered ? "TTC + ex-VAT" : "TTC only"}
          </span>
        </div>
        <RevenueChart
          series={series}
          showExVat={vat.registered}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExportCard />
        <Suspense fallback={<CoachShimmer />}>
          <CoachCard
            initialCached={cached}
            isOwner={ctx.role === "owner"}
          />
        </Suspense>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums text-olive">
        {value}
      </p>
      {subtitle && (
        <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
          {subtitle}
        </p>
      )}
    </Card>
  );
}

function DeltaCard({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}) {
  let pct: string;
  let arrow: "up" | "down" | "flat";
  let absLabel: string;
  if (previous === 0) {
    pct = current > 0 ? "+∞%" : "—";
    arrow = current > 0 ? "up" : "flat";
    absLabel = current > 0 ? `+${formatGBP(current)}` : "no baseline";
  } else {
    const ratio = (current - previous) / previous;
    const rounded = Math.round(ratio * 100);
    pct = rounded === 0 ? "0%" : rounded > 0 ? `+${rounded}%` : `${rounded}%`;
    arrow = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    const delta = current - previous;
    absLabel = delta === 0 ? "no change" : delta > 0 ? `+${formatGBP(delta)}` : `${formatGBP(delta)}`;
  }
  const arrowChar = arrow === "up" ? "↗" : arrow === "down" ? "↘" : "→";
  const fg = arrow === "up" ? "#5C6B4E" : arrow === "down" ? "#D45B5B" : "#3E3E31";
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p
        className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums"
        style={{ color: fg }}
      >
        {arrowChar} {pct}
      </p>
      <p className="mt-2 text-[12px] tabular-nums tracking-snug text-olive-soft">
        {absLabel}
      </p>
    </Card>
  );
}

function CoachShimmer() {
  return (
    <Card className="p-5">
      <div className="h-5 w-2/3 rounded-md bg-cream-deep" />
      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[68px] w-full animate-pulse rounded-[14px] bg-cream-deep/70"
          />
        ))}
      </div>
    </Card>
  );
}
