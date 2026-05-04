import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { runMonthlyPayrollNotification } from "@/lib/payroll/monthly";

/**
 * GET /api/cron/monthly-payroll
 *
 * Bearer-auth-protected. Iterates every tenant and runs the monthly
 * payroll notification action for each. Designed to be invoked by
 * Vercel Cron on the 1st of each month at 08:00 UTC.
 *
 * TODO: post-deploy, add to vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/monthly-payroll", "schedule": "0 8 1 * *" }
 *   ]
 * }
 * Runs 1st of every month at 08:00 UTC.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const { data: tenants } = await admin.from("tenants").select("id");
  const tenantIds = ((tenants ?? []) as Array<{ id: string }>).map((t) => t.id);

  let tenantsProcessed = 0;
  let notificationsCreated = 0;
  let emailsSent = 0;
  const failures: Array<{ tenantId: string; error: string }> = [];

  for (const tenantId of tenantIds) {
    try {
      const r = await runMonthlyPayrollNotification(tenantId);
      tenantsProcessed += 1;
      notificationsCreated += r.notificationsCreated;
      emailsSent += r.emailsSent;
    } catch (e) {
      failures.push({
        tenantId,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed,
    notificationsCreated,
    emailsSent,
    failures,
  });
}
