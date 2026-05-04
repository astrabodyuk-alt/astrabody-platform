import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { insertNotification } from "@/lib/notifications/insert";

/**
 * GET /api/cron/bank-holiday-reminders
 *
 * Bearer-auth-protected. Daily nudge to owners about pending bank
 * holiday decisions:
 *   - 55–65 days out → high-priority notification ("X is in 60 days").
 *   - 14 days out (still pending) → urgent notification.
 *
 * TODO: post-deploy, add to vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/bank-holiday-reminders", "schedule": "0 8 * * *" }
 *   ]
 * }
 * Daily at 08:00 UTC.
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

  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);
  const ymdAt = (offsetDays: number): string =>
    new Date(today.getTime() + offsetDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

  const twoMonthLow = ymdAt(55);
  const twoMonthHigh = ymdAt(65);
  const twoWeekTarget = ymdAt(14);

  // First reminder window: 55–65 days out, never reminded.
  const { data: firstWave } = await admin
    .from("bank_holiday_decisions")
    .select("id, tenant_id, date, name")
    .eq("decision", "pending")
    .gte("date", twoMonthLow)
    .lte("date", twoMonthHigh)
    .is("reminder_sent_at", null);

  // Second wave: 14 days out, never urgently reminded.
  const { data: urgentWave } = await admin
    .from("bank_holiday_decisions")
    .select("id, tenant_id, date, name")
    .eq("decision", "pending")
    .eq("date", twoWeekTarget)
    .is("urgent_reminder_sent_at", null);

  let firstSent = 0;
  let urgentSent = 0;

  for (const row of (firstWave ?? []) as Array<{
    id: string;
    tenant_id: string;
    date: string;
    name: string;
  }>) {
    const days = Math.ceil(
      (new Date(`${row.date}T00:00:00`).getTime() - Date.now()) / 86_400_000
    );
    await fanOutToOwners(admin, row.tenant_id, {
      kind: "bank_holiday_reminder",
      title: `${row.name} is in ${days} days — will you be open?`,
      body: `You haven't set a closure for ${row.name} (${row.date}). Tap to decide.`,
      actionUrl: `/admin/settings?tab=schedule&highlight=${row.id}`,
      priority: "high",
    });
    await admin
      .from("bank_holiday_decisions")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    firstSent++;
  }

  for (const row of (urgentWave ?? []) as Array<{
    id: string;
    tenant_id: string;
    date: string;
    name: string;
  }>) {
    await fanOutToOwners(admin, row.tenant_id, {
      kind: "bank_holiday_reminder",
      title: `${row.name} is in 14 days — still no decision`,
      body: `Last call to set the closure for ${row.name} (${row.date}).`,
      actionUrl: `/admin/settings?tab=schedule&highlight=${row.id}`,
      priority: "urgent",
    });
    await admin
      .from("bank_holiday_decisions")
      .update({ urgent_reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    urgentSent++;
  }

  return NextResponse.json({
    ok: true,
    today: todayYmd,
    firstSent,
    urgentSent,
  });
}

async function fanOutToOwners(
  admin: ReturnType<typeof createAdminSupabase>,
  tenantId: string,
  payload: {
    kind: "bank_holiday_reminder";
    title: string;
    body: string;
    actionUrl: string;
    priority: "high" | "urgent";
  }
): Promise<void> {
  const { data: ownerRows } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin"]);
  for (const o of (ownerRows ?? []) as Array<{ user_id: string }>) {
    await insertNotification({
      tenantId,
      recipientUserId: o.user_id,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      actionUrl: payload.actionUrl,
      priority: payload.priority,
    });
  }
}
