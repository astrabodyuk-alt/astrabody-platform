import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { PayrollClient, type PayrollScope, type StaffAggregate } from "./PayrollClient";
import type { CommissionRow } from "../me/CommissionsTable";

/**
 * /admin/payroll — owner / admin only.
 *
 * Three scope tabs: This month / Last month / All-time. Aggregate per-staff
 * totals (pending + paid) and a click-row drawer that lists every commission
 * row in scope for that staff and lets you mark all pending → paid.
 */
export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  if (!ctx.isOwnerOrAdmin) redirect("/admin");

  const params = await searchParams;
  const scope: PayrollScope =
    params.scope === "last_month" || params.scope === "all"
      ? params.scope
      : "this_month";

  const tz = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const [year, month] = ymd.split("-").map(Number);
  const thisMonthStart = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    tz
  );
  const nextMonthYmd =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const thisMonthEnd = fromZonedTime(`${nextMonthYmd}T00:00:00`, tz);
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = fromZonedTime(
    `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}-01T00:00:00`,
    tz
  );
  const lastMonthEnd = thisMonthStart;

  const supabase = await createServerSupabase();

  // We pull every commission row in scope (typically dozens, not thousands
  // for a single tenant) plus the staff list. Aggregation happens here.
  let query = supabase
    .from("commissions")
    .select(
      "id, staff_id, amount_pence, rate_pct, status, created_at, paid_at, " +
        "bookings (id, starts_at, price_pence, services (name), clients (full_name, email))"
    )
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (scope === "this_month") {
    query = query
      .gte("created_at", thisMonthStart.toISOString())
      .lt("created_at", thisMonthEnd.toISOString());
  } else if (scope === "last_month") {
    query = query
      .gte("created_at", lastMonthStart.toISOString())
      .lt("created_at", lastMonthEnd.toISOString());
  }

  const [commissionsResult, staffResult] = await Promise.all([
    query,
    supabase
      .from("staff")
      .select("id, display_name, commission_rate_pct, photo_url")
      .eq("tenant_id", ctx.tenantId)
      .order("sort_order", { ascending: true }),
  ]);

  const allCommissions = (commissionsResult.data ?? []) as unknown as Array<{
    id: string;
    staff_id: string;
    amount_pence: number;
    rate_pct: number;
    status: "pending" | "paid" | "void";
    created_at: string;
    paid_at: string | null;
    bookings: {
      id: string;
      starts_at: string;
      price_pence: number;
      services: unknown;
      clients: unknown;
    } | null;
  }>;
  const staffList = (staffResult.data ?? []) as Array<{
    id: string;
    display_name: string;
    commission_rate_pct: number;
    photo_url: string | null;
  }>;

  const aggregates: StaffAggregate[] = staffList.map((s) => {
    const rows = allCommissions.filter((c) => c.staff_id === s.id);
    const pending = rows
      .filter((r) => r.status === "pending")
      .reduce((acc, r) => acc + (r.amount_pence ?? 0), 0);
    const paid = rows
      .filter((r) => r.status === "paid")
      .reduce((acc, r) => acc + (r.amount_pence ?? 0), 0);
    const voided = rows
      .filter((r) => r.status === "void")
      .reduce((acc, r) => acc + (r.amount_pence ?? 0), 0);
    return {
      staffId: s.id,
      displayName: s.display_name,
      photoUrl: s.photo_url,
      ratePct: Number(s.commission_rate_pct),
      pendingPence: pending,
      paidPence: paid,
      voidPence: voided,
      totalPence: pending + paid,
      rowCount: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        amount_pence: r.amount_pence,
        rate_pct: Number(r.rate_pct),
        status: r.status,
        created_at: r.created_at,
        paid_at: r.paid_at,
        bookings: r.bookings as CommissionRow["bookings"],
      })),
    };
  });

  // Order: highest pending first, then highest total.
  aggregates.sort((a, b) => {
    if (b.pendingPence !== a.pendingPence) return b.pendingPence - a.pendingPence;
    return b.totalPence - a.totalPence;
  });

  const pendingTotal = aggregates.reduce((acc, s) => acc + s.pendingPence, 0);
  const paidTotal = aggregates.reduce((acc, s) => acc + s.paidPence, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Payroll
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Sales commissions per staff &middot; click a row to review and pay.
        </p>
      </header>

      {staffList.length === 0 && (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No staff yet. Add staff in Settings.
          </p>
        </Card>
      )}

      {staffList.length > 0 && (
        <PayrollClient
          scope={scope}
          aggregates={aggregates}
          pendingTotal={pendingTotal}
          paidTotal={paidTotal}
        />
      )}
    </div>
  );
}
