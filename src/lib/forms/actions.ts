"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import { sendWhatsAppTemplate } from "@/lib/comms/sendWhatsAppTemplate";
import { generateIntakeToken } from "./queries";
import type { IntakeField } from "./shared";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "text",
  "textarea",
  "yes_no",
  "multiple_choice",
  "signature",
]);

interface UpsertFormInput {
  id?: string | null;
  name: string;
  serviceIds: string[];
  fields: IntakeField[];
  isActive: boolean;
}

export async function upsertIntakeForm(
  input: UpsertFormInput
): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (input.fields.length === 0) {
    return { ok: false, error: "Add at least one field." };
  }
  for (const f of input.fields) {
    if (!ALLOWED_TYPES.has(f.type)) {
      return { ok: false, error: `Unknown field type: ${f.type}` };
    }
    if (!f.id || !f.label.trim()) {
      return { ok: false, error: "Each field needs an id and a label." };
    }
    if (f.type === "multiple_choice") {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        return {
          ok: false,
          error: "Multiple-choice fields need at least two options.",
        };
      }
    }
  }

  const admin = createAdminSupabase();

  // Validate the service ids belong to this tenant.
  if (input.serviceIds.length > 0) {
    const { data: services } = await admin
      .from("services")
      .select("id, tenant_id")
      .in("id", input.serviceIds);
    const okIds = new Set(
      ((services ?? []) as Array<{ id: string; tenant_id: string }>)
        .filter((s) => s.tenant_id === ctx.tenantId)
        .map((s) => s.id)
    );
    for (const id of input.serviceIds) {
      if (!okIds.has(id)) {
        return { ok: false, error: "Service doesn't belong to this tenant." };
      }
    }
  }

  const row = {
    tenant_id: ctx.tenantId,
    name,
    service_ids: input.serviceIds,
    fields: input.fields,
    is_active: input.isActive,
  };

  if (input.id) {
    const { error } = await admin
      .from("intake_forms")
      .update(row)
      .eq("id", input.id)
      .eq("tenant_id", ctx.tenantId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/settings");
    return { ok: true, id: input.id };
  }

  const { data, error } = await admin
    .from("intake_forms")
    .insert({ ...row, created_by_user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't save the form." };
  }
  revalidatePath("/admin/settings");
  return { ok: true, id: data.id as string };
}

export async function deleteIntakeForm(formId: string): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("intake_forms")
    .delete()
    .eq("id", formId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Fire-and-forget hook called from createBookingAndIntent. Looks up
 * an active form for the service; if found, mints an intake_responses
 * row with a fresh token. Idempotent — guarded by the unique
 * (booking_id) constraint.
 */
export async function ensureIntakeResponseForBooking(args: {
  tenantId: string;
  bookingId: string;
  serviceId: string;
  clientId: string;
  startsAtIso: string;
}): Promise<{ tokenCreated: string | null }> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("intake_responses")
    .select("id, token")
    .eq("booking_id", args.bookingId)
    .maybeSingle();
  if (existing) return { tokenCreated: null };

  const { getActiveFormForService } = await import("./queries");
  const form = await getActiveFormForService(args.tenantId, args.serviceId);
  if (!form) return { tokenCreated: null };

  // Token expires 2h after the appointment so the client can still
  // fill it in last minute.
  const expiresAt = new Date(
    new Date(args.startsAtIso).getTime() + 2 * 60 * 60 * 1000
  ).toISOString();
  const token = generateIntakeToken();
  const { error } = await admin.from("intake_responses").insert({
    tenant_id: args.tenantId,
    booking_id: args.bookingId,
    form_id: form.id,
    client_id: args.clientId,
    token,
    expires_at: expiresAt,
  });
  if (error) {
    console.warn("[intake] response insert failed", error);
    return { tokenCreated: null };
  }
  return { tokenCreated: token };
}

/**
 * Owner / admin clicks "Resend link" from the booking drawer. Sends
 * the WhatsApp + email immediately, marks reminder_sent_at.
 */
export async function resendIntakeLink(
  bookingId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("intake_responses")
    .select(
      "id, token, expires_at, submitted_at, tenant_id, " +
        "bookings:booking_id (starts_at, clients (full_name, email, phone), services (name)), " +
        "tenants:tenant_id (name, slug, subdomain, custom_domain)"
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!row || (row as unknown as { tenant_id: string }).tenant_id !== ctx.tenantId) {
    return { ok: false, error: "No intake form on this booking." };
  }

  type Joined = {
    id: string;
    token: string;
    expires_at: string;
    submitted_at: string | null;
    bookings:
      | {
          starts_at: string;
          clients:
            | { full_name: string | null; email: string | null; phone: string | null }
            | { full_name: string | null; email: string | null; phone: string | null }[]
            | null;
          services: { name: string } | { name: string }[] | null;
        }
      | {
          starts_at: string;
          clients:
            | { full_name: string | null; email: string | null; phone: string | null }
            | { full_name: string | null; email: string | null; phone: string | null }[]
            | null;
          services: { name: string } | { name: string }[] | null;
        }[]
      | null;
    tenants:
      | {
          name: string | null;
          slug: string | null;
          subdomain: string | null;
          custom_domain: string | null;
        }
      | {
          name: string | null;
          slug: string | null;
          subdomain: string | null;
          custom_domain: string | null;
        }[]
      | null;
  };
  const j = row as unknown as Joined;
  if (j.submitted_at) {
    return { ok: false, error: "This form is already submitted." };
  }
  const booking = Array.isArray(j.bookings) ? j.bookings[0] : j.bookings;
  if (!booking) return { ok: false, error: "Booking not found." };
  const tenant = Array.isArray(j.tenants) ? j.tenants[0] : j.tenants;
  const client = Array.isArray(booking.clients)
    ? booking.clients[0]
    : booking.clients;
  const service = Array.isArray(booking.services)
    ? booking.services[0]
    : booking.services;

  await sendIntakeLinkOut({
    token: j.token,
    tenantName: (tenant?.name as string | null | undefined) ?? "the studio",
    portalHost: tenant ?? null,
    serviceName: service?.name ?? null,
    startsAtIso: booking.starts_at,
    clientName: client?.full_name ?? null,
    clientEmail: client?.email ?? null,
    clientPhone: client?.phone ?? null,
    tenantId: ctx.tenantId,
    clientId: null,
  });

  await admin
    .from("intake_responses")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", j.id);

  return { ok: true };
}

/**
 * Centralised send so the booking-creation hook, the 24h cron, and
 * the manual "Resend" button all dispatch identical copy.
 */
export async function sendIntakeLinkOut(args: {
  token: string;
  tenantName: string;
  portalHost: {
    custom_domain?: string | null;
    subdomain?: string | null;
    slug?: string | null;
  } | null;
  serviceName: string | null;
  startsAtIso: string;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  tenantId: string;
  clientId: string | null;
}): Promise<void> {
  const link = buildIntakeUrl(args.portalHost, args.token);
  const dateLabel = new Date(args.startsAtIso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
  const firstName =
    (args.clientName ?? "").trim().split(/\s+/)[0] || "there";
  const serviceName = args.serviceName ?? "your session";

  if (args.clientPhone) {
    await sendWhatsAppTemplate({
      toPhone: args.clientPhone,
      templateName: "intake_form_request",
      variables: {
        first_name: firstName,
        service_name: serviceName,
        date: dateLabel,
        tenant_name: args.tenantName,
        intake_link: link,
      },
    }).catch((e) => console.warn("[intake] whatsapp send failed", e));
  }

  if (args.clientEmail) {
    const subject = `A quick form before your ${serviceName} on ${dateLabel}`;
    const bodyMd = `Hi ${firstName},

Before we see you at **${args.tenantName}**, please take 2 minutes to complete this short health form. It helps us tailor the session safely.

[Open the form](${link})

Any questions, just reply to this email.

— ${args.tenantName}`;
    const rendered = await renderEmail(subject, bodyMd, {
      tenant: { name: args.tenantName },
      client: { first_name: firstName },
    });
    await sendOne({
      tenantId: args.tenantId,
      templateId: null,
      clientId: args.clientId,
      toEmail: args.clientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }).catch((e) => console.warn("[intake] email send failed", e));
  }
}

function buildIntakeUrl(
  tenant:
    | {
        custom_domain?: string | null;
        subdomain?: string | null;
        slug?: string | null;
      }
    | null,
  token: string
): string {
  const path = `/intake/${token}`;
  if (!tenant) return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
  if (tenant.custom_domain) return `https://${tenant.custom_domain}${path}`;
  if (tenant.subdomain) return `https://${tenant.subdomain}.atavoplatform.com${path}`;
  if (tenant.slug) return `https://${tenant.slug}.atavoplatform.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
