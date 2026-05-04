"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderEmail, buildMockContext } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import {
  resolveSegmentRecipients,
  countSegment,
  type SegmentQuery,
} from "@/lib/email/segments";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// ---- TEMPLATES -------------------------------------------------------

/**
 * Save edits to an email_templates row. Owner / admin only — front-line
 * staff don't change templated copy. Returns the updated_at so the
 * editor's "saved a moment ago" tag can refresh.
 */
export async function updateEmailTemplate(input: {
  id: string;
  name?: string;
  subject?: string;
  body_md?: string;
  is_active?: boolean;
}): Promise<Result<{ updatedAt: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const update: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const v = input.name.trim();
    if (!v) return { ok: false, error: "name can't be empty" };
    update.name = v;
  }
  if (typeof input.subject === "string") {
    const v = input.subject.trim();
    if (!v) return { ok: false, error: "subject can't be empty" };
    update.subject = v;
  }
  if (typeof input.body_md === "string") {
    update.body_md = input.body_md;
  }
  if (typeof input.is_active === "boolean") {
    update.is_active = input.is_active;
  }
  if (Object.keys(update).length === 0)
    return { ok: true, updatedAt: new Date().toISOString() };

  const admin = createAdminSupabase();
  // Confirm template belongs to this tenant.
  const { data: existing } = await admin
    .from("email_templates")
    .select("id, tenant_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!existing || existing.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "template not in your tenant" };
  }
  const { data, error } = await admin
    .from("email_templates")
    .update(update)
    .eq("id", input.id)
    .select("updated_at")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "save failed" };

  revalidatePath("/admin/emails");
  return { ok: true, updatedAt: data.updated_at as string };
}

/**
 * Send a one-off test of a template to the logged-in admin's email.
 * Uses the mock context so {{handlebars}} render with realistic values
 * (Sarah, Tove, etc).
 */
export async function sendTestEmail(input: {
  templateId: string;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.email) return { ok: false, error: "admin email not on file" };

  const admin = createAdminSupabase();
  const { data: tpl } = await admin
    .from("email_templates")
    .select("id, tenant_id, subject, body_md, slug")
    .eq("id", input.templateId)
    .maybeSingle();
  if (!tpl || tpl.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "template not in your tenant" };
  }
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const tenantName = (tenant?.name as string | undefined) ?? "Astrabody";

  const rendered = await renderEmail(
    tpl.subject as string,
    tpl.body_md as string,
    buildMockContext(tenantName)
  );
  const r = await sendOne({
    tenantId: ctx.tenantId,
    templateId: tpl.id as string,
    clientId: null,
    toEmail: ctx.email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
  });
  if (!r.ok) return { ok: false, error: r.error ?? "send failed" };
  return { ok: true };
}

// ---- BROADCASTS / CAMPAIGNS -----------------------------------------

/**
 * Live count for the segment picker on the composer. Fast — avoids
 * the full recipient hydration when the composer is just rendering a
 * "this will go to N people" tag.
 */
export async function getSegmentCount(
  query: SegmentQuery
): Promise<Result<{ count: number }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  const count = await countSegment(ctx.tenantId, query);
  return { ok: true, count };
}

/**
 * Save a campaign as a draft, schedule it for later, or send now. The
 * "send now" path resolves the segment server-side, renders the email
 * once, and sendOne()s it for each recipient sequentially.
 *
 * Sequential not parallel because Resend's free + starter plans limit
 * to ~10 reqs/sec. For larger tenants, a queue worker would chunk this
 * — out of scope for V1. TODO(post-deploy): move to a job queue.
 */
export async function saveOrSendCampaign(input: {
  id?: string;
  name: string;
  subject: string;
  body_md: string;
  segment: SegmentQuery;
  /** "draft" | "schedule" | "send" */
  intent: "draft" | "schedule" | "send";
  scheduledAt?: string | null;
}): Promise<
  Result<{
    id: string;
    status: "draft" | "scheduled" | "sending" | "sent" | "failed";
    sentCount?: number;
    failedCount?: number;
  }>
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin)
    return { ok: false, error: "owner / admin only" };

  const name = input.name.trim();
  const subject = input.subject.trim();
  if (!name || !subject || !input.body_md.trim()) {
    return { ok: false, error: "name, subject, and body are required" };
  }

  const admin = createAdminSupabase();

  // Persist the campaign row first so both draft and scheduled paths
  // share the same code path.
  const status =
    input.intent === "draft"
      ? "draft"
      : input.intent === "schedule"
        ? "scheduled"
        : "sending";

  const row = {
    tenant_id: ctx.tenantId,
    name,
    subject,
    body_md: input.body_md,
    segment_query: input.segment as unknown as object,
    scheduled_at: input.scheduledAt ?? null,
    status,
    created_by_user_id: ctx.userId,
  };

  let id = input.id;
  if (id) {
    const { error } = await admin
      .from("email_broadcasts")
      .update(row)
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await admin
      .from("email_broadcasts")
      .insert(row)
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "couldn't save" };
    }
    id = created.id as string;
  }

  if (input.intent !== "send") {
    revalidatePath("/admin/emails");
    return { ok: true, id, status: status as "draft" | "scheduled" };
  }

  // Send-now path. Resolve recipients, render once, fan out.
  const recipients = await resolveSegmentRecipients(
    ctx.tenantId,
    input.segment
  );
  if (recipients.length === 0) {
    await admin
      .from("email_broadcasts")
      .update({
        status: "sent",
        sent_count: 0,
        sent_at: new Date().toISOString(),
      })
      .eq("id", id);
    revalidatePath("/admin/emails");
    return { ok: true, id, status: "sent", sentCount: 0, failedCount: 0 };
  }

  const tenantName = await getTenantName(ctx.tenantId);
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const ctxObj = {
      client: {
        first_name: firstName(recipient.fullName),
        full_name: recipient.fullName ?? "",
      },
      tenant: { name: tenantName },
    };
    const rendered = await renderEmail(subject, input.body_md, ctxObj);
    const r = await sendOne({
      tenantId: ctx.tenantId,
      templateId: null,
      clientId: recipient.clientId,
      toEmail: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (r.ok) sent++;
    else failed++;
  }

  await admin
    .from("email_broadcasts")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sent_count: sent,
      sent_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/admin/emails");
  return {
    ok: true,
    id,
    status: failed > 0 && sent === 0 ? "failed" : "sent",
    sentCount: sent,
    failedCount: failed,
  };
}

// ---- AI ASSIST -------------------------------------------------------

const SYSTEM_PROMPT = `You are a copywriter for a premium UK beauty/wellness studio.
Voice: warm, premium, UK English, no marketing-speak, contractions OK, never use em-dashes, acknowledge difficulty before offering solutions.
Avoid filler openers ("Thank you for", "We're delighted to", "Absolutely"). Avoid jargon.
Output strictly as JSON {"subject": string, "body_md": string} where body_md is 80 to 160 words of markdown.
Do not wrap in code fences. Do not add prose before or after.`;

/**
 * Drafts campaign copy from a one-line brief. Owner / admin only —
 * limits Anthropic spend.
 */
export async function aiAssistCopy(
  brief: string
): Promise<Result<{ subject: string; body_md: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin)
    return { ok: false, error: "owner / admin only" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };

  const trimmed = brief.trim();
  if (!trimmed)
    return { ok: false, error: "brief is empty" };

  const tenantName = await getTenantName(ctx.tenantId);

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Studio: ${tenantName}.\nBrief: ${trimmed}\nDraft the email.`,
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "anthropic call failed";
    return { ok: false, error: msg };
  }

  const text = response.content
    .map((block) =>
      "type" in block && block.type === "text" && "text" in block
        ? (block as { text: string }).text
        : ""
    )
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return { ok: false, error: "model returned non-JSON output" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "model returned an empty object" };
  }
  const obj = parsed as { subject?: unknown; body_md?: unknown };
  const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
  const body_md = typeof obj.body_md === "string" ? obj.body_md.trim() : "";
  if (!subject || !body_md) {
    return { ok: false, error: "model output missing subject/body" };
  }

  // Hard guard: scrub em-dashes the model might have slipped in,
  // matching the project rule.
  const scrub = (s: string) => s.replace(/—/g, ", ").replace(/–/g, "-");

  return { ok: true, subject: scrub(subject), body_md: scrub(body_md) };
}

// ---- helpers ---------------------------------------------------------

async function getTenantName(tenantId: string): Promise<string> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "Astrabody";
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function firstName(full: string | null): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}
