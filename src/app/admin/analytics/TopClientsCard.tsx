import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import type { TopClientRow } from "@/lib/analytics/queries";

export function TopClientsCard({ rows }: { rows: TopClientRow[] }) {
  return (
    <Card className="p-5">
      <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Top clients
      </h3>
      <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
        Top 10 by spend this period.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] tracking-snug text-olive-soft">
          No completed sessions this period.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-olive/10">
          {rows.map((r) => (
            <li key={r.clientId}>
              <Link
                href={`/admin/clients/${r.clientId}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-sage/5"
              >
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-olive">
                    {r.fullName}
                  </div>
                  <div className="text-[12px] tracking-snug text-olive-soft">
                    {r.sessions} session{r.sessions === 1 ? "" : "s"}
                    {r.lastVisit
                      ? ` · last ${formatDistanceToNowStrict(new Date(r.lastVisit))} ago`
                      : ""}
                  </div>
                </div>
                <div className="font-serif text-[16px] font-medium tabular-nums text-olive">
                  {formatGBP(r.totalSpentPence)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
