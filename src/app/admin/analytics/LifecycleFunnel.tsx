import { Card } from "@/components/ui/card";
import type {
  FunnelResult,
  PeriodWindow,
} from "@/lib/analytics/queries";

export function LifecycleFunnel({
  funnel,
  period,
}: {
  funnel: FunnelResult;
  period: PeriodWindow;
}) {
  const max = funnel.stages.reduce((m, s) => (s.count > m ? s.count : m), 0);

  return (
    <Card className="mt-4 p-5">
      <ul className="flex flex-col gap-4">
        {funnel.stages.map((stage, i) => {
          const pctOfMax = max === 0 ? 0 : (stage.count / max) * 100;
          const prev = i === 0 ? null : funnel.stages[i - 1];
          const conv =
            prev == null
              ? null
              : prev.count === 0
                ? null
                : Math.round((stage.count / prev.count) * 100);
          return (
            <li key={stage.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-[16px] font-medium text-olive">
                  {stage.label}
                </span>
                <span className="font-serif text-[18px] font-medium tabular-nums text-olive">
                  {stage.count.toLocaleString("en-GB")}
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-cream-deep">
                <div
                  className="h-full rounded-full bg-sage"
                  style={{ width: `${Math.max(2, pctOfMax)}%` }}
                />
              </div>
              {conv !== null && (
                <p className="text-[11px] tracking-snug text-olive-soft">
                  {conv}% from previous step
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <Insight funnel={funnel} period={period} />
    </Card>
  );
}

function Insight({
  funnel,
  period,
}: {
  funnel: FunnelResult;
  period: PeriodWindow;
}) {
  const newClients = funnel.stages[0].count;
  const returned = funnel.stages[3].count;
  const perTen = newClients === 0 ? 0 : Math.round((returned / newClients) * 10);

  const dropFrom = funnel.stages[funnel.biggestDropFromIdx];
  const dropTo = funnel.stages[funnel.biggestDropFromIdx + 1] ?? dropFrom;

  const lossLabel =
    funnel.estimatedNoShowLossPence > 0
      ? new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
          maximumFractionDigits: 0,
        }).format(funnel.estimatedNoShowLossPence / 100)
      : "£0";

  const periodLabel = period.label.toLowerCase();

  return (
    <div className="mt-5 rounded-xl border border-sage/20 bg-sage/5 p-4">
      <p className="text-[13px] leading-snug text-olive">
        Of every 10 new clients in the {periodLabel}, <strong>{perTen}</strong>{" "}
        came back for a second visit. Your biggest drop-off is between{" "}
        <strong>{dropFrom.label}</strong> and <strong>{dropTo.label}</strong>.
        {funnel.estimatedNoShowLossPence > 0 && (
          <>
            {" "}Reducing no-shows could add roughly <strong>{lossLabel}</strong>{" "}
            to revenue over a similar window.
          </>
        )}
      </p>
    </div>
  );
}
