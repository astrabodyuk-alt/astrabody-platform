import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import type { TopServiceRow } from "@/lib/analytics/queries";

export function TopServicesCard({ rows }: { rows: TopServiceRow[] }) {
  return (
    <Card className="p-5">
      <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Top services
      </h3>
      <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
        Top 5 by revenue this period.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] tracking-snug text-olive-soft">
          No completed sessions this period.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-olive/10">
          {rows.map((r) => (
            <li
              key={r.serviceId}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-olive">
                  {r.name}
                </div>
                <div className="text-[12px] tracking-snug text-olive-soft">
                  {r.sessions} session{r.sessions === 1 ? "" : "s"} ·{" "}
                  {formatGBP(r.avgTicketPence)} avg
                </div>
              </div>
              <div className="font-serif text-[16px] font-medium tabular-nums text-olive">
                {formatGBP(r.revenuePence)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
