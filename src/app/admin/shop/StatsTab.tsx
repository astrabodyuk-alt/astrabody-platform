import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";

export interface StatsShape {
  monthSold: number;
  revenuePence: number;
  topProductName: string | null;
  topProductSold: number;
  averageOrderPence: number;
}

export function StatsTab({ stats }: { stats: StatsShape }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Sold this month"
        value={String(stats.monthSold)}
        sub={`${stats.monthSold === 1 ? "purchase" : "purchases"}`}
      />
      <Stat
        label="Revenue this month"
        value={formatGBP(stats.revenuePence)}
        sub="Across all paid orders"
      />
      <Stat
        label="Top product"
        value={stats.topProductName ?? "—"}
        sub={stats.topProductSold > 0 ? `${stats.topProductSold} sold` : "—"}
      />
      <Stat
        label="Average order"
        value={formatGBP(stats.averageOrderPence)}
        sub="Paid orders only"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[24px] font-medium leading-tight tracking-tightest tabular-nums text-olive">
        {value}
      </p>
      <p className="mt-2 text-[12px] tracking-snug text-olive-soft">{sub}</p>
    </Card>
  );
}
