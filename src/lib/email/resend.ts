import "server-only";
import { Resend } from "resend";
import { createAdminSupabase } from "@/lib/supabase/admin";

const FROM =
  process.env.RESEND_FROM_EMAIL && process.env.RESEND_FROM_EMAIL.includes("<")
    ? process.env.RESEND_FROM_EMAIL
    : `Astrabody <${process.env.RESEND_FROM_EMAIL ?? "enquiries@astrabody.co.uk"}>`;

let _client: Resend | null = null;
function client(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _client = new Resend(key);
  }
  return _client;
}

export interface SendOneInput {
  tenantId: string;
  /** When sending from a template, the template id (logged for filterability). */
  templateId?: string | null;
  /** Optional client id — populated for transactional + broadcast sends to known clients. */
  clientId?: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional reply-to override. Defaults to the FROM address. */
  replyTo?: string;
}

/**
 * Send one email via Resend and write a row in email_sends. Failures
 * are logged with status='failed' rather than throwing — callers
 * (broadcast loop, lifecycle dispatcher) decide whether to retry.
 *
 * Returns the email_sends.id.
 */
export async function sendOne(input: SendOneInput): Promise<{
  ok: boolean;
  sendId: string | null;
  resendId: string | null;
  error?: string;
}> {
  const admin = createAdminSupabase();

  // Insert a queued row first so we have an audit row even if Resend
  // fails. The webhook will move it to delivered/bounced later.
  const { data: queued, error: insertError } = await admin
    .from("email_sends")
    .insert({
      tenant_id: input.tenantId,
      template_id: input.templateId ?? null,
      client_id: input.clientId ?? null,
      to_email: input.toEmail,
      subject: input.subject,
      body_html: input.html,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !queued) {
    return {
      ok: false,
      sendId: null,
      resendId: null,
      error: insertError?.message ?? "couldn't queue send",
    };
  }
  const sendId = queued.id as string;

  try {
    const r = await client().emails.send({
      from: FROM,
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      headers: {
        "X-Astrabody-Send-Id": sendId,
      },
    });

    if (r.error) {
      await admin
        .from("email_sends")
        .update({ status: "failed", error: r.error.message ?? String(r.error) })
        .eq("id", sendId);
      return { ok: false, sendId, resendId: null, error: r.error.message };
    }

    const resendId = r.data?.id ?? null;
    await admin
      .from("email_sends")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_id: resendId,
      })
      .eq("id", sendId);

    return { ok: true, sendId, resendId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    await admin
      .from("email_sends")
      .update({ status: "failed", error: msg })
      .eq("id", sendId);
    return { ok: false, sendId, resendId: null, error: msg };
  }
}

/** Resolve the FROM address that will appear on the email. */
export function getFromAddress(): string {
  return FROM;
}
