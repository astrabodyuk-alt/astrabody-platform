import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiBundle, KpiMetric } from "@/lib/analytics/queries";

export function KpiRow({ kpis }: { kpis: KpiBundle }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      <KpiCard kpi={kpis.avgBookingValue} />
      <KpiCard kpi={kpis.repeatRate} />
      <KpiCard kpi={kpis.noShowRate} />
      <KpiCard kpi={kpis.revenuePerClient} />
    </div>
  );
}

function KpiCard({ kpi }: { kpi: KpiMetric }) {
  return (
    <Card className="min-w-[180px] shrink-0 p-5 sm:min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {kpi.label}
      </p>
      <p className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums text-olive">
        {kpi.value}
      </p>
      <TrendBadge kpi={kpi} />
    </Card>
  );
}

function TrendBadge({ kpi }: { kpi: KpiMetric }) {
  if (kpi.delta == null) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] tracking-snug text-olive-soft">
        <Minus className="size-3" />
        no prior data
      </p>
    );
  }
  if (Math.abs(kpi.delta) < 0.005) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] tracking-snug text-olive-soft">
        <Minus className="size-3" />
        flat vs prior
      </p>
    );
  }
  const up = kpi.delta > 0;
  // For inverse metrics (no-show rate) "down" = good.
  const isGood = kpi.inverse ? !up : up;
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-center gap-1 text-[11px] tracking-snug",
        isGood ? "text-sage-deep" : "text-destructive"
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {(Math.abs(kpi.delta) * 100).toFixed(1)}% vs prior
    </p>
  );
}
