import Link from "next/link";
import { fromZonedTime } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/utils";
import { SalesClient, type SaleRow } from "./SalesClient";

/**
 * /admin/sales — history of in-studio pack purchases.
 *
 * KPI: this month's pack revenue + delta vs last month. Below: a
 * full-width table of every package_purchases row, click-to-drawer
 * with refund (owner / admin only) + notes.
 */
export default async function AdminSalesPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();

  const tz = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const [year, month] = ymd.split("-").map(Number);
  const thisMonthStart = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    tz
  );
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = fromZonedTime(
    `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}-01T00:00:00`,
    tz
  );

  // Pull recent purchases (last 200) + per-month totals via the same
  // result, since 200 rows is small enough to filter client-side.
  const { data: purchases } = await supabase
    .from("package_purchases")
    .select(
      "id, amount_paid_pence, payment_method, refunded, refunded_at, " +
        "reference, notes, created_at, " +
        "service_packages:package_id (name, price_pence), " +
        "clients (id, full_name, email), " +
        "sold_by:sold_by_staff_id (id, display_name), " +
        "client_packages:client_package_id (id, sessions_total, sessions_remaining, status, expires_at)"
    )
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (purchases ?? []) as unknown as SaleRow[];

  const thisMonthTotal = rows
    .filter(
      (r) => !r.refunded && new Date(r.created_at) >= thisMonthStart
    )
    .reduce((acc, r) => acc + r.amount_paid_pence, 0);
  const lastMonthTotal = rows
    .filter(
      (r) =>
        !r.refunded &&
        new Date(r.created_at) >= lastMonthStart &&
        new Date(r.created_at) < thisMonthStart
    )
    .reduce((acc, r) => acc + r.amount_paid_pence, 0);

  let delta: string;
  if (lastMonthTotal === 0 && thisMonthTotal === 0) {
    delta = "Nothing yet this month";
  } else if (lastMonthTotal === 0) {
    delta = `${formatGBP(thisMonthTotal)} this month, no baseline yet`;
  } else {
    const pct = Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);
    delta =
      pct >= 0
        ? `+${pct}% vs last month (${formatGBP(lastMonthTotal)})`
        : `${pct}% vs last month (${formatGBP(lastMonthTotal)})`;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
            Sales
          </h1>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            In-studio pack purchases &middot; history and totals.
          </p>
        </div>
        <Link href="/admin/sales/new">
          <Button type="button" variant="primary" size="sm">
            New sale
          </Button>
        </Link>
      </header>

      <Card className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          This month&rsquo;s pack revenue
        </p>
        <p className="mt-2 font-serif text-[32px] font-medium leading-none tracking-tightest tabular-nums text-olive">
          {formatGBP(thisMonthTotal)}
        </p>
        <p className="mt-2 text-[13px] tracking-snug text-olive-soft">{delta}</p>
      </Card>

      <SalesClient rows={rows} canRefund={ctx.isOwnerOrAdmin} />
    </div>
  );
}
