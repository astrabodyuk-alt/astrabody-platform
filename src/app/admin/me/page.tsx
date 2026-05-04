import { fromZonedTime } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/utils";
import { CommissionsTable, type CommissionRow } from "./CommissionsTable";

/**
 * /admin/me — staff earnings dashboard.
 *
 * Shows the current month's pending commissions, last paid pot, and a
 * table of the most recent 30 commission rows. Visible to every staff
 * member — owner / admin see their own staff_id row (they're staff too).
 *
 * Read-only. Mark-paid lives on /admin/payroll (owner / admin only).
 */
export default async function AdminMePage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();

  if (!ctx.staffId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
            Your earnings
          </h1>
        </header>
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            You&rsquo;re signed in as a tenant member but no staff profile
            is linked yet. Ask the owner to link your staff record in
            Settings → Staff.
          </p>
        </Card>
      </div>
    );
  }

  const tz = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: tz });
  const [year, month] = ymd.split("-").map(Number);
  const monthStart = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    tz
  );
  const nextMonthYmd =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = fromZonedTime(`${nextMonthYmd}T00:00:00`, tz);

  const [thisMonthResult, pendingResult, lastPaidResult, recentResult] =
    await Promise.all([
      supabase
        .from("commissions")
        .select("amount_pence, status")
        .eq("tenant_id", ctx.tenantId)
        .eq("staff_id", ctx.staffId)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", monthEnd.toISOString())
        .neq("status", "void"),
      supabase
        .from("commissions")
        .select("amount_pence")
        .eq("tenant_id", ctx.tenantId)
        .eq("staff_id", ctx.staffId)
        .eq("status", "pending"),
      supabase
        .from("commissions")
        .select("amount_pence, paid_at")
        .eq("tenant_id", ctx.tenantId)
        .eq("staff_id", ctx.staffId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(50),
      supabase
        .from("commissions")
        .select(
          "id, amount_pence, rate_pct, status, created_at, paid_at, " +
            "bookings (id, starts_at, price_pence, services (name), clients (full_name, email))"
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("staff_id", ctx.staffId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const thisMonthTotal = (thisMonthResult.data ?? []).reduce(
    (acc, r) => acc + ((r.amount_pence as number | null) ?? 0),
    0
  );
  const pendingTotal = (pendingResult.data ?? []).reduce(
    (acc, r) => acc + ((r.amount_pence as number | null) ?? 0),
    0
  );

  // "Last paid" = most recent paid_at; sum the rows that share that exact
  // paid_at timestamp (a payroll run pays a batch in one transaction).
  const paidRows = (lastPaidResult.data ?? []) as Array<{
    amount_pence: number;
    paid_at: string;
  }>;
  let lastPaidTotal = 0;
  let lastPaidAt: string | null = null;
  if (paidRows.length > 0) {
    lastPaidAt = paidRows[0].paid_at;
    for (const r of paidRows) {
      if (r.paid_at === lastPaidAt) lastPaidTotal += r.amount_pence;
    }
  }

  const recent = (recentResult.data ?? []) as unknown as CommissionRow[];

  const monthLabel = now.toLocaleDateString("en-GB", {
    month: "long",
    timeZone: tz,
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Your earnings
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {monthLabel} so far &middot; pending and paid commissions
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={`${monthLabel} so far`}
          value={formatGBP(thisMonthTotal)}
        />
        <Stat label="Pending payout" value={formatGBP(pendingTotal)} />
        <Stat
          label="Last paid"
          value={lastPaidAt ? formatGBP(lastPaidTotal) : "—"}
          sub={lastPaidAt ? formatPaidDate(lastPaidAt, tz) : "Nothing paid yet"}
        />
      </div>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Recent commissions
        </h2>
        <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
          Your last {recent.length} {recent.length === 1 ? "row" : "rows"}.
          Commissions land when a booking transitions to confirmed.
        </p>
        <div className="mt-4">
          <CommissionsTable rows={recent} />
        </div>
      </section>
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
        <p className="mt-2 text-[12px] tracking-snug text-olive-soft">{sub}</p>
      )}
    </Card>
  );
}

function formatPaidDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: tz,
  });
}
