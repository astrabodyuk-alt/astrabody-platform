import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  insertNotification,
  getOwnerUserIds,
} from "@/lib/notifications/insert";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";

const TZ = "Europe/London";

interface RunResult {
  tenantId: string;
  ok: boolean;
  notificationsCreated: number;
  emailsSent: number;
  totalPence: number;
  staffCount: number;
  monthIso: string;
  skipReason?: string;
}

/**
 * Compute pending commissions for a tenant's last completed calendar
 * month, then notify every owner via the bell + an email. Idempotent:
 * the notification dedupe key is `monthly_payroll:<YYYY-MM>` so a
 * second run within 60 seconds is a no-op, and the email_sends row is
 * the only audit a re-run would visibly produce twice (the cron is
 * scheduled once per month, so this is acceptable).
 *
 * Returns a structured summary so the cron route can report counts.
 */
export async function runMonthlyPayrollNotification(
  tenantId: string
): Promise<RunResult> {
  const admin = createAdminSupabase();

  // Last completed calendar month, in tenant tz.
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [year, month] = ymd.split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const monthIso = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const startIso = fromZonedTime(`${monthIso}-01T00:00:00`, TZ).toISOString();
  const endYear = month === 1 ? year : year;
  const endMonth = month === 1 ? 1 : month;
  const endIso = fromZonedTime(
    `${endYear}-${String(endMonth).padStart(2, "0")}-01T00:00:00`,
    TZ
  ).toISOString();

  const monthLabel = new Date(
    Date.UTC(prevYear, prevMonth - 1, 1)
  ).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const { data: commissionsRaw } = await admin
    .from("commissions")
    .select("staff_id, amount_pence, status, " +
      "staff:staff_id (display_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  type Row = {
    staff_id: string;
    amount_pence: number;
    staff:
      | { display_name: string }
      | { display_name: string }[]
      | null;
  };
  const rows = (commissionsRaw ?? []) as unknown as Row[];

  const totals = new Map<string, { name: string; pence: number }>();
  for (const r of rows) {
    const staffEmbed = Array.isArray(r.staff) ? r.staff[0] : r.staff;
    const name = staffEmbed?.display_name ?? "Unknown";
    const prev = totals.get(r.staff_id) ?? { name, pence: 0 };
    prev.pence += r.amount_pence ?? 0;
    totals.set(r.staff_id, prev);
  }
  const totalPence = Array.from(totals.values()).reduce(
    (acc, v) => acc + v.pence,
    0
  );
  const staffCount = totals.size;

  // No commissions → no-op. The cron still runs cleanly so the route
  // can report counts.
  if (staffCount === 0 || totalPence === 0) {
    return {
      tenantId,
      ok: true,
      notificationsCreated: 0,
      emailsSent: 0,
      totalPence: 0,
      staffCount: 0,
      monthIso,
      skipReason: "no pending commissions for this month",
    };
  }

  const ownerIds = await getOwnerUserIds(tenantId);
  if (ownerIds.length === 0) {
    return {
      tenantId,
      ok: true,
      notificationsCreated: 0,
      emailsSent: 0,
      totalPence,
      staffCount,
      monthIso,
      skipReason: "tenant has no owner",
    };
  }

  const title = `Your ${monthLabel} payroll is ready`;
  const totalLabel = `£${(totalPence / 100).toFixed(2)}`;
  const body = `${totalLabel} owed across ${staffCount} staff. Tap to review and mark as paid.`;
  const actionUrl = `/admin/payroll?month=${monthIso}`;

  let notificationsCreated = 0;
  for (const userId of ownerIds) {
    const r = await insertNotification({
      tenantId,
      recipientUserId: userId,
      kind: "monthly_payroll_ready",
      priority: "high",
      title,
      body,
      actionUrl,
      payload: {
        month: monthIso,
        total_pence: totalPence,
        staff_count: staffCount,
      },
      dedupeKey: `monthly_payroll:${monthIso}`,
    });
    if (r.ok && r.id) notificationsCreated += 1;
  }

  // Email to each owner. Resolve owner email via auth + clients
  // fallback (some tenants store the owner identity on staff.user_id);
  // for V1 we use the auth.users.email lookup via the admin client.
  const { data: owners } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  let emailsSent = 0;
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name, owner_email")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantName = (tenantRow?.name as string | undefined) ?? "Astrabody";
  const fallbackEmail = (tenantRow?.owner_email as string | null) ?? null;

  for (const owner of (owners ?? []) as Array<{ user_id: string }>) {
    let email: string | null = fallbackEmail;
    // Try to find a staff row linked to this user with an email — that's
    // typically the owner's working address.
    const { data: staff } = await admin
      .from("staff")
      .select("email")
      .eq("user_id", owner.user_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (staff?.email) email = staff.email as string;
    if (!email) continue;

    const subject = `Your ${monthLabel} payroll is ready`;
    const md = `Hi,

${monthLabel}'s payroll is ready to review.

**${totalLabel}** owed across ${staffCount} staff.

[Review and mark as paid]({{baseUrl}}${actionUrl})

We've also added a notification in your dashboard, so whichever you check first, it's there.

The Astrabody platform`;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://astrabody.co.uk";
    const rendered = await renderEmail(subject, md.replace("{{baseUrl}}", baseUrl), {
      tenant: { name: tenantName },
    });
    const r = await sendOne({
      tenantId,
      templateId: null,
      clientId: null,
      toEmail: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (r.ok) emailsSent += 1;
  }

  return {
    tenantId,
    ok: true,
    notificationsCreated,
    emailsSent,
    totalPence,
    staffCount,
    monthIso,
  };
}
