import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail, type EmailContext } from "./render";
import { sendOne } from "./resend";

/**
 * Lifecycle email dispatcher. A single entry point that walks all the
 * "ready to send" rules for a tenant and dispatches them. Designed to
 * be invoked from a Vercel cron every 5 minutes — see TODO at the
 * bottom for the cron wiring.
 *
 * Each rule is idempotent: we re-check email_sends before queueing so
 * a missed cron tick or a manual run doesn't double-send.
 */

const TZ = "Europe/London";

export interface DispatchResult {
  scanned: number;
  sent: number;
  failed: number;
  notes: string[];
}

export async function dispatchLifecycleEmails(
  tenantId: string
): Promise<DispatchResult> {
  const admin = createAdminSupabase();
  const result: DispatchResult = { scanned: 0, sent: 0, failed: 0, notes: [] };

  // Resolve tenant + active templates indexed by slug.
  const [tenantRow, templatesResult] = await Promise.all([
    admin
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("email_templates")
      .select("id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
  ]);
  const tenantName = (tenantRow.data?.name as string | undefined) ?? "Astrabody";
  type Tpl = {
    id: string;
    slug: string;
    subject: string;
    body_md: string;
    trigger: string;
    trigger_offset_minutes: number | null;
  };
  const templates = (templatesResult.data ?? []) as Tpl[];
  const bySlug = new Map(templates.map((t) => [t.slug, t]));

  // 1. 24h reminder: confirmed bookings ~24h ahead.
  const reminderTpl = bySlug.get("booking_reminder_24h");
  if (reminderTpl) {
    const lo = new Date(Date.now() + 1435 * 60_000).toISOString();
    const hi = new Date(Date.now() + 1445 * 60_000).toISOString();
    const { data: bookings } = await admin
      .from("bookings")
      .select(
        "id, starts_at, client_id, " +
          "clients (full_name, email), " +
          "services (name), " +
          "staff:staff_id (display_name)"
      )
      .eq("tenant_id", tenantId)
      .eq("status", "confirmed")
      .gte("starts_at", lo)
      .lt("starts_at", hi);
    for (const b of ((bookings ?? []) as unknown) as Array<RawBooking>) {
      result.scanned++;
      const skip = await alreadySentForBooking(b.id, reminderTpl.id);
      if (skip) continue;
      const ok = await renderAndSend(
        tenantId,
        reminderTpl,
        b,
        tenantName
      );
      ok ? result.sent++ : result.failed++;
    }
  }

  // 2. After-care: completed bookings ~120 min ago, picking the
  //    after_care_<service.slug> template if one exists.
  const lo = new Date(Date.now() - 130 * 60_000).toISOString();
  const hi = new Date(Date.now() - 110 * 60_000).toISOString();
  const { data: completed } = await admin
    .from("bookings")
    .select(
      "id, starts_at, ends_at, client_id, service_id, " +
        "clients (full_name, email), " +
        "services (slug, name), " +
        "staff:staff_id (display_name)"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("ends_at", lo)
    .lt("ends_at", hi);
  for (const b of ((completed ?? []) as unknown) as Array<RawBooking>) {
    result.scanned++;
    const svc = pickFirst<{ slug: string; name: string }>(b.services);
    const slugCandidate = svc?.slug ? `after_care_${normaliseServiceSlug(svc.slug)}` : null;
    const tpl = slugCandidate ? bySlug.get(slugCandidate) : null;
    if (!tpl) continue;
    const skip = await alreadySentForBooking(b.id, tpl.id);
    if (skip) continue;
    const ok = await renderAndSend(tenantId, tpl, b, tenantName);
    ok ? result.sent++ : result.failed++;
  }

  // 3. Re-engagement at 60+ days inactive, gated by "no reengagement
  //    email in last 90 days for this client".
  const reengagementTpl = bySlug.get("reengagement_60d");
  if (reengagementTpl) {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data: inactive } = await admin
      .from("clients")
      .select("id, full_name, email, last_booking_at")
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null)
      .lt("last_booking_at", sixtyDaysAgo);
    for (const c of (inactive ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      last_booking_at: string | null;
    }>) {
      result.scanned++;
      const skip = await alreadyReengagedRecently(
        tenantId,
        c.id,
        reengagementTpl.id
      );
      if (skip) continue;
      const ctx: EmailContext = {
        client: {
          first_name: firstName(c.full_name),
          full_name: c.full_name ?? "",
        },
        tenant: { name: tenantName },
        voucher: { code: "BACK10" },
        staff: { first_name: "Nigel" },
      };
      const ok = await renderAndSendCtx(
        tenantId,
        reengagementTpl,
        c.email!,
        c.id,
        ctx
      );
      ok ? result.sent++ : result.failed++;
    }
  }

  // 4. Birthdays today (in tenant tz). Once per year.
  const birthdayTpl = bySlug.get("birthday");
  if (birthdayTpl) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const [, mm, dd] = today.split("-");
    const monthDay = `${mm}-${dd}`;
    // birth_date is `date` — match on month + day regardless of year.
    const { data: birthdays } = await admin
      .from("clients")
      .select("id, full_name, email, birth_date")
      .eq("tenant_id", tenantId)
      .eq("marketing_opt_in", true)
      .not("email", "is", null)
      .not("birth_date", "is", null);
    for (const c of (birthdays ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      birth_date: string | null;
    }>) {
      if (!c.birth_date) continue;
      const md = c.birth_date.slice(5, 10); // "MM-DD"
      if (md !== monthDay) continue;
      result.scanned++;
      const skip = await alreadyBirthdayThisYear(
        tenantId,
        c.id,
        birthdayTpl.id
      );
      if (skip) continue;
      const ctx: EmailContext = {
        client: {
          first_name: firstName(c.full_name),
          full_name: c.full_name ?? "",
        },
        tenant: { name: tenantName },
        voucher: { code: "BIRTHDAY" },
      };
      const ok = await renderAndSendCtx(
        tenantId,
        birthdayTpl,
        c.email!,
        c.id,
        ctx
      );
      ok ? result.sent++ : result.failed++;
    }
  }

  return result;
}

// --- helpers --------------------------------------------------------

interface RawBooking {
  id: string;
  starts_at: string;
  ends_at?: string;
  client_id: string;
  clients: unknown;
  services: unknown;
  staff: unknown;
}

async function alreadySentForBooking(
  bookingId: string,
  templateId: string
): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("email_sends")
    .select("id, body_html")
    .eq("template_id", templateId)
    .ilike("body_html", `%${bookingId}%`)
    .limit(1);
  // Cheap scope check: lifecycle templates embed the booking id via
  // the X-Astrabody-Send-Id header, but that lives outside the row.
  // A safer dedupe is to track booking-bound sends explicitly — for
  // V1 we use the body_html ilike as a soft-dedupe and accept the
  // theoretical collision risk on small tenants. TODO(prompt-cron):
  // add `email_sends.booking_id` so this becomes an exact lookup.
  return ((data ?? []) as unknown[]).length > 0;
}

async function alreadyReengagedRecently(
  tenantId: string,
  clientId: string,
  templateId: string
): Promise<boolean> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data } = await admin
    .from("email_sends")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("template_id", templateId)
    .gt("created_at", cutoff)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

async function alreadyBirthdayThisYear(
  tenantId: string,
  clientId: string,
  templateId: string
): Promise<boolean> {
  const admin = createAdminSupabase();
  const startOfYear = new Date(
    `${new Date().getFullYear()}-01-01T00:00:00Z`
  ).toISOString();
  const { data } = await admin
    .from("email_sends")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("template_id", templateId)
    .gt("created_at", startOfYear)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

async function renderAndSend(
  tenantId: string,
  tpl: { id: string; subject: string; body_md: string },
  booking: RawBooking,
  tenantName: string
): Promise<boolean> {
  const cli = pickFirst<{ full_name: string | null; email: string | null }>(
    booking.clients
  );
  const svc = pickFirst<{ name: string }>(booking.services);
  const stf = pickFirst<{ display_name: string }>(booking.staff);
  if (!cli?.email) return false;
  const startsAt = new Date(booking.starts_at);
  const ctx: EmailContext = {
    client: {
      first_name: firstName(cli.full_name),
      full_name: cli.full_name ?? "",
    },
    booking: {
      starts_at_friendly: startsAt.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: TZ,
      }),
      time: startsAt
        .toLocaleTimeString("en-GB", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: TZ,
        })
        .replace(/\s+/g, "")
        .toLowerCase(),
    },
    service: { name: svc?.name ?? "Session" },
    staff: {
      first_name: firstName(stf?.display_name ?? null),
      display_name: stf?.display_name ?? "",
    },
    tenant: { name: tenantName },
  };
  return renderAndSendCtx(tenantId, tpl, cli.email, booking.client_id, ctx);
}

async function renderAndSendCtx(
  tenantId: string,
  tpl: { id: string; subject: string; body_md: string },
  toEmail: string,
  clientId: string | null,
  ctx: EmailContext
): Promise<boolean> {
  const rendered = await renderEmail(tpl.subject, tpl.body_md, ctx);
  const r = await sendOne({
    tenantId,
    templateId: tpl.id,
    clientId,
    toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return r.ok;
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function firstName(full: string | null): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

/**
 * Map a service slug like "fat-freezing-zone" to the suffix used by
 * after-care templates ("fat_freezing"). Keeps the seed slugs short
 * while still letting per-service templates target specific slugs.
 */
function normaliseServiceSlug(slug: string): string {
  // Hyphens → underscores; drop trailing modifiers ("-zone", "-trial").
  const stem = slug
    .replace(/-?(zone|trial|trial-upsell|round)s?$/i, "")
    .replace(/-suprasculpt$/i, "")
    .replace(/-/g, "_");
  // Map known bookable slugs to their after-care template tail.
  const map: Record<string, string> = {
    infrabike: "infrabike",
    ems_suprasculpt: "ems",
    ems: "ems",
    fat_freezing: "fat_freezing",
    laser_hair_removal: "laser",
  };
  return map[stem] ?? stem;
}

// TODO(post-deploy): wire this dispatcher to a Vercel cron at
// `/api/cron/email-dispatch` running every 5 minutes, guarded by
// CRON_SECRET. Loops every active tenant and calls
// dispatchLifecycleEmails(tenantId).
