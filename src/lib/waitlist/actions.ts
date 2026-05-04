"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { getPortalContext } from "@/lib/portal/booking-queries";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/comms/sendWhatsAppTemplate";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type WaitlistWindow = "morning" | "afternoon" | "evening" | "any";

interface JoinInput {
  serviceId: string;
  preferredDate: string;
  preferredWindow?: WaitlistWindow;
  staffId?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS: ReadonlySet<WaitlistWindow> = new Set([
  "morning",
  "afternoon",
  "evening",
  "any",
]);

/** Client-facing — drops the row that the notify hook later picks up. */
export async function joinWaitlist(
  input: JoinInput
): Promise<Result<{ id: string }>> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "Sign in to join the waitlist." };
  }

  if (!DATE_RE.test(input.preferredDate)) {
    return { ok: false, error: "Invalid date." };
  }
  const window: WaitlistWindow = WINDOWS.has(input.preferredWindow ?? "any")
    ? (input.preferredWindow ?? "any")
    : "any";

  const admin = createAdminSupabase();

  // Confirm the service belongs to this tenant — defence in depth on
  // top of the RLS check.
  const { data: service } = await admin
    .from("services")
    .select("id, tenant_id, is_bookable")
    .eq("id", input.serviceId)
    .maybeSingle();
  if (!service || service.tenant_id !== portal.tenantId) {
    return { ok: false, error: "Service not found." };
  }
  if (service.is_bookable === false) {
    return { ok: false, error: "Service isn't bookable right now." };
  }

  // Optional staff scope.
  let staffId: string | null = null;
  if (input.staffId) {
    const { data: link } = await admin
      .from("staff_services")
      .select("staff_id")
      .eq("service_id", input.serviceId)
      .eq("staff_id", input.staffId)
      .maybeSingle();
    if (!link) {
      return { ok: false, error: "Practitioner not found for this service." };
    }
    staffId = input.staffId;
  }

  // Soft de-dupe — a client only needs one row per (service, date) at a
  // time. If they re-add with a different window, refresh the row.
  const { data: existing } = await admin
    .from("waitlist_entries")
    .select("id")
    .eq("tenant_id", portal.tenantId)
    .eq("client_id", portal.clientId)
    .eq("service_id", input.serviceId)
    .eq("preferred_date", input.preferredDate)
    .is("notified_at", null)
    .maybeSingle();
  if (existing) {
    await admin
      .from("waitlist_entries")
      .update({ preferred_window: window, staff_id: staffId })
      .eq("id", existing.id);
    return { ok: true, id: existing.id as string };
  }

  const { data, error } = await admin
    .from("waitlist_entries")
    .insert({
      tenant_id: portal.tenantId,
      client_id: portal.clientId,
      service_id: input.serviceId,
      staff_id: staffId,
      preferred_date: input.preferredDate,
      preferred_window: window,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't join." };
  }
  return { ok: true, id: data.id as string };
}

export async function leaveWaitlist(entryId: string): Promise<Result> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "Sign in." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("waitlist_entries")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", portal.tenantId)
    .eq("client_id", portal.clientId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adminDeleteWaitlistEntry(
  entryId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("waitlist_entries")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/bookings");
  return { ok: true };
}

/**
 * Fire-and-forget when a slot opens. Pings the FIRST eligible
 * waitlist entry (FIFO by created_at). One at a time so we don't
 * overbook — if the slot is still unclaimed after 2 hours, a follow-up
 * cron should ping the next entry. (TODO: cron stub below.)
 *
 * Match rules:
 *   - service_id matches.
 *   - preferred_date matches the freed date OR is within ±1 day if no
 *     exact match exists.
 *   - notified_at IS NULL, expires_at > now().
 *   - If staff_id was specified on the entry, it must match the freed
 *     staff (or freedStaffId is null = "anyone").
 */
export async function notifyWaitlistForSlot(args: {
  tenantId: string;
  serviceId: string;
  freedDate: string;
  freedStaffId: string | null;
}): Promise<{ notifiedEntryId: string | null }> {
  if (!DATE_RE.test(args.freedDate)) return { notifiedEntryId: null };

  const admin = createAdminSupabase();

  // Try exact-match first; fall back to ±1 day.
  const exact = await pickFirstPending(admin, {
    ...args,
    dateMatch: "exact",
  });
  const target = exact ?? (await pickFirstPending(admin, {
    ...args,
    dateMatch: "near",
  }));
  if (!target) return { notifiedEntryId: null };

  await admin
    .from("waitlist_entries")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", target.id);

  // Look up the client's phone + the service name + the tenant's portal
  // URL so the WhatsApp message can include a deep link.
  const [{ data: client }, { data: service }, { data: tenant }] =
    await Promise.all([
      admin
        .from("clients")
        .select("full_name, phone")
        .eq("id", target.client_id)
        .maybeSingle(),
      admin
        .from("services")
        .select("name")
        .eq("id", args.serviceId)
        .maybeSingle(),
      admin
        .from("tenants")
        .select("name, slug, subdomain, custom_domain")
        .eq("id", args.tenantId)
        .maybeSingle(),
    ]);

  const phone = (client?.phone as string | null | undefined) ?? null;
  if (!phone) {
    console.info(
      "[waitlist/notify] entry has no phone on file, skipping WhatsApp",
      target.id
    );
    return { notifiedEntryId: target.id };
  }

  const dateLabel = new Date(`${args.freedDate}T00:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long" }
  );
  const bookUrl = buildPortalUrl(
    tenant as
      | {
          custom_domain?: string | null;
          subdomain?: string | null;
          slug?: string | null;
        }
      | null,
    `/portal/book/${args.serviceId}`
  );

  await sendWhatsAppTemplate({
    toPhone: phone,
    templateName: "waitlist_slot_opened",
    variables: {
      first_name: ((client?.full_name as string | null) ?? "")
        .trim()
        .split(/\s+/)[0] || "there",
      service_name:
        (service?.name as string | null | undefined) ?? "your session",
      date: dateLabel,
      tenant_name: (tenant?.name as string | undefined) ?? "the studio",
      book_link: bookUrl,
    },
  });

  return { notifiedEntryId: target.id };
}

interface PendingTarget {
  id: string;
  client_id: string;
}

async function pickFirstPending(
  admin: ReturnType<typeof createAdminSupabase>,
  args: {
    tenantId: string;
    serviceId: string;
    freedDate: string;
    freedStaffId: string | null;
    dateMatch: "exact" | "near";
  }
): Promise<PendingTarget | null> {
  const nowIso = new Date().toISOString();
  let q = admin
    .from("waitlist_entries")
    .select("id, client_id, staff_id, preferred_date")
    .eq("tenant_id", args.tenantId)
    .eq("service_id", args.serviceId)
    .is("notified_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(20);

  if (args.dateMatch === "exact") {
    q = q.eq("preferred_date", args.freedDate);
  } else {
    const day = new Date(`${args.freedDate}T00:00:00`).getTime();
    const minus = new Date(day - 86_400_000).toISOString().slice(0, 10);
    const plus = new Date(day + 86_400_000).toISOString().slice(0, 10);
    q = q.gte("preferred_date", minus).lte("preferred_date", plus);
  }
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    client_id: string;
    staff_id: string | null;
    preferred_date: string;
  }>;

  // Filter on staff. The DB query stays simple; this filter keeps the
  // logic readable.
  const match = rows.find((r) => {
    if (!r.staff_id) return true; // entry says "any practitioner"
    if (!args.freedStaffId) return true; // freed staff unknown → don't filter out
    return r.staff_id === args.freedStaffId;
  });
  if (!match) return null;
  return { id: match.id, client_id: match.client_id };
}

function buildPortalUrl(
  tenant:
    | {
        custom_domain?: string | null;
        subdomain?: string | null;
        slug?: string | null;
      }
    | null,
  path: string
): string {
  if (!tenant) return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
  if (tenant.custom_domain) return `https://${tenant.custom_domain}${path}`;
  if (tenant.subdomain) return `https://${tenant.subdomain}.atavoplatform.com${path}`;
  if (tenant.slug) return `https://${tenant.slug}.atavoplatform.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
