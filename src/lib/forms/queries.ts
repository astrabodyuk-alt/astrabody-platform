import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { IntakeFormRow, IntakeResponseRow } from "./shared";

export type { IntakeField, IntakeFormRow, IntakeResponseRow } from "./shared";

/** Pick the first active form attached to this service, if any. */
export async function getActiveFormForService(
  tenantId: string,
  serviceId: string
): Promise<IntakeFormRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("intake_forms")
    .select("id, tenant_id, name, service_ids, fields, is_active, created_at")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .contains("service_ids", [serviceId])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as IntakeFormRow | null) ?? null;
}

/** Look up a response by its public token. */
export async function getResponseByToken(
  token: string
): Promise<{
  response: IntakeResponseRow;
  form: IntakeFormRow;
  serviceName: string | null;
  startsAt: string | null;
  tenantName: string;
} | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("intake_responses")
    .select(
      "id, tenant_id, booking_id, form_id, client_id, answers, submitted_at, token, reminder_sent_at, expires_at, created_at, " +
        "intake_forms (id, tenant_id, name, service_ids, fields, is_active, created_at), " +
        "bookings:booking_id (starts_at, services (name)), " +
        "tenants:tenant_id (name)"
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  type Joined = {
    id: string;
    tenant_id: string;
    booking_id: string;
    form_id: string;
    client_id: string;
    answers: Record<string, string>;
    submitted_at: string | null;
    token: string;
    reminder_sent_at: string | null;
    expires_at: string;
    created_at: string;
    intake_forms: IntakeFormRow | IntakeFormRow[] | null;
    bookings:
      | { starts_at: string; services: { name: string } | { name: string }[] | null }
      | { starts_at: string; services: { name: string } | { name: string }[] | null }[]
      | null;
    tenants: { name: string } | { name: string }[] | null;
  };
  const row = data as unknown as Joined;
  const form = Array.isArray(row.intake_forms)
    ? row.intake_forms[0]
    : row.intake_forms;
  if (!form) return null;
  const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
  const svc = booking
    ? Array.isArray(booking.services)
      ? booking.services[0]
      : booking.services
    : null;
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;

  return {
    response: {
      id: row.id,
      tenant_id: row.tenant_id,
      booking_id: row.booking_id,
      form_id: row.form_id,
      client_id: row.client_id,
      answers: row.answers,
      submitted_at: row.submitted_at,
      token: row.token,
      reminder_sent_at: row.reminder_sent_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
    },
    form,
    serviceName: svc?.name ?? null,
    startsAt: booking?.starts_at ?? null,
    tenantName: tenant?.name ?? "the studio",
  };
}

/** 32-char URL-safe token. */
export function generateIntakeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // Base64url, drop padding.
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 32);
}
