import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail, type EmailContext } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";

/**
 * Send the owner an internal NPS-feedback note when a client scores
 * below 9. Subject: "Internal: NPS feedback from {{first_name}}".
 * Recipient: tenants.owner_email if set, else RESEND_FROM_EMAIL, else
 * silently no-op.
 *
 * The email body is rendered from a tiny inline template (not a
 * tenant-editable email_templates row) so the operator can't
 * accidentally point the owner alert at a marketing template.
 */
export async function sendInternalNpsFeedback(input: {
  tenantId: string;
  clientId: string;
  reviewRequestId: string;
  npsScore: number;
  comment: string | null;
}): Promise<void> {
  const admin = createAdminSupabase();

  const [{ data: tenant }, { data: client }] = await Promise.all([
    admin
      .from("tenants")
      .select("name, owner_email")
      .eq("id", input.tenantId)
      .maybeSingle(),
    admin
      .from("clients")
      .select("full_name, email")
      .eq("id", input.clientId)
      .maybeSingle(),
  ]);

  const ownerEmail =
    (tenant?.owner_email as string | undefined) ??
    process.env.RESEND_FROM_EMAIL?.match(/<(.+)>/)?.[1] ??
    process.env.RESEND_FROM_EMAIL ??
    null;
  if (!ownerEmail) return;

  const fullName = (client?.full_name as string | null) ?? "the client";
  const firstName = fullName.trim().split(/\s+/)[0] || "the client";

  const ctx: EmailContext = {
    tenant: { name: (tenant?.name as string | undefined) ?? "Astrabody" },
    client: {
      first_name: firstName,
      full_name: fullName,
      email: (client?.email as string | null) ?? "—",
    },
    nps: {
      score: String(input.npsScore),
      comment: input.comment ?? "(no comment given)",
    },
  };

  const subject = `Internal: NPS feedback from {{client.first_name}}`;
  const body = `Heads-up — {{client.first_name}} ({{client.email}}) just left an NPS score of {{nps.score}}.

What they wrote:

> {{nps.comment}}

This came in via /portal/review and is private. The client did NOT see a Google-review prompt; we only show that path to scores of 9 or 10.

You can reply to {{client.email}} directly if you'd like to follow up.`;

  const rendered = await renderEmail(subject, body, ctx);
  await sendOne({
    tenantId: input.tenantId,
    templateId: null,
    clientId: input.clientId,
    toEmail: ownerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
