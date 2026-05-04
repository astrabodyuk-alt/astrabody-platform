"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveSegmentRecipients, countSegment } from "@/lib/email/segments";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import type { SegmentQuery } from "@/lib/email/segments-shared";

export type CommsTriggerKind =
  | "studio_closure"
  | "bank_holiday_closure"
  | "working_hours_change"
  | "service_price_change"
  | "new_service"
  | "flash_slot"
  | "new_package"
  | "loyalty_promotion"
  | "studio_reopening"
  | "win_back";

export interface CommsProposalRow {
  id: string;
  tenant_id: string;
  trigger_kind: CommsTriggerKind;
  trigger_ref_id: string | null;
  trigger_summary: string;
  draft_subject: string | null;
  draft_body_md: string | null;
  default_segment: SegmentQuery;
  status: "pending" | "sent" | "dismissed";
  sent_at: string | null;
  sent_count: number | null;
  dismissed_at: string | null;
  created_at: string;
}

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const DRAFT_SYSTEM_PROMPT = `You are a copywriter for a premium UK beauty / wellness studio. The owner just made a change and wants to tell their clients.
Voice: warm, premium, UK English. Contractions OK. No em-dashes. No marketing puffery. No "absolutely / definitely". No filler openers ("Thank you for", "We're delighted to").
Limit body to 80 words. Keep it human.
Output strictly as JSON {"subject": string, "body_md": string} where body_md is short markdown.
No code fences. No prose before or after.`;

// -------------------------------------------------------------
// createCommsProposal — fire-and-forget from any owner action
// -------------------------------------------------------------

export async function createCommsProposal(input: {
  tenantId: string;
  triggerKind: CommsTriggerKind;
  triggerRefId?: string | null;
  triggerSummary: string;
  defaultSegment?: SegmentQuery;
  createdByUserId?: string | null;
}): Promise<Result<{ proposalId: string }>> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("comms_proposals")
    .insert({
      tenant_id: input.tenantId,
      trigger_kind: input.triggerKind,
      trigger_ref_id: input.triggerRefId ?? null,
      trigger_summary: input.triggerSummary,
      default_segment: input.defaultSegment ?? { type: "all" },
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.warn("[comms] proposal insert failed", error);
    return { ok: false, error: error?.message ?? "couldn't create" };
  }
  // Best-effort draft. The bar is usable even if this fails — the owner
  // can edit the empty draft inline.
  void generateCommsDraft(data.id as string).catch((err) => {
    console.warn("[comms] draft generation failed", err);
  });
  return { ok: true, proposalId: data.id as string };
}

// -------------------------------------------------------------
// generateCommsDraft — calls Haiku for subject + body
// -------------------------------------------------------------

export async function generateCommsDraft(
  proposalId: string
): Promise<Result<{ subject: string; bodyMd: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "AI is not configured." };

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("comms_proposals")
    .select("id, tenant_id, trigger_summary")
    .eq("id", proposalId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Proposal not found." };

  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", row.tenant_id)
    .maybeSingle();
  const tenantName = (tenant?.name as string | undefined) ?? "the studio";

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const userBlock = `Announcement: ${row.trigger_summary}.
Studio: ${tenantName}.
Date: ${today}.
Write the email.`;

  const client = new Anthropic({ apiKey });
  let subject = "";
  let bodyMd = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userBlock }],
    });
    const text = response.content
      .map((b) =>
        "type" in b && b.type === "text" && "text" in b
          ? (b as { text: string }).text
          : ""
      )
      .join("")
      .trim();
    const cleaned = stripFences(text);
    const parsed = JSON.parse(cleaned) as {
      subject?: unknown;
      body_md?: unknown;
    };
    if (typeof parsed.subject === "string") subject = parsed.subject;
    if (typeof parsed.body_md === "string") bodyMd = parsed.body_md;
  } catch (err) {
    console.warn("[comms] AI draft failed", err);
    return { ok: false, error: "Couldn't draft the email." };
  }

  if (!subject || !bodyMd) {
    return { ok: false, error: "Couldn't parse draft." };
  }

  await admin
    .from("comms_proposals")
    .update({ draft_subject: subject, draft_body_md: bodyMd })
    .eq("id", proposalId);

  return { ok: true, subject, bodyMd };
}

// -------------------------------------------------------------
// dismissCommsProposal — owner clicked "Dismiss"
// -------------------------------------------------------------

export async function dismissCommsProposal(
  proposalId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can dismiss." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("comms_proposals")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      dismissed_by_user_id: ctx.userId,
    })
    .eq("id", proposalId)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/emails");
  return { ok: true };
}

// -------------------------------------------------------------
// getCommsRecipientCount — pulled live at sheet open
// -------------------------------------------------------------

export async function getCommsRecipientCount(
  segment: SegmentQuery
): Promise<Result<{ count: number }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can preview." };
  }
  const count = await countSegment(ctx.tenantId, segment);
  return { ok: true, count };
}

// -------------------------------------------------------------
// sendCommsProposal — fan-out via existing sendOne pipeline
// -------------------------------------------------------------

export async function sendCommsProposal(input: {
  proposalId: string;
  subject: string;
  bodyMd: string;
  segment: SegmentQuery;
  scheduleAt?: string | null;
}): Promise<Result<{ sentCount: number; failedCount: number }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can send." };
  }

  const subject = input.subject.trim();
  const bodyMd = input.bodyMd.trim();
  if (!subject || !bodyMd) {
    return { ok: false, error: "Subject and body are required." };
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("comms_proposals")
    .select("id, tenant_id, status")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (!row || row.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Proposal not found." };
  }
  if (row.status !== "pending") {
    return { ok: false, error: "This proposal has already been resolved." };
  }

  const { data: tenantRow } = await admin
    .from("tenants")
    .select("name")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const tenantName = (tenantRow?.name as string | undefined) ?? "Studio";

  // Persist a broadcast row first so /admin/emails/history reflects it
  // alongside campaigns.
  const broadcastStatus = input.scheduleAt ? "scheduled" : "sending";
  const { data: broadcast, error: broadcastErr } = await admin
    .from("email_broadcasts")
    .insert({
      tenant_id: ctx.tenantId,
      name: `Announcement · ${input.proposalId.slice(0, 8)}`,
      subject,
      body_md: bodyMd,
      segment_query: input.segment as unknown as object,
      scheduled_at: input.scheduleAt ?? null,
      status: broadcastStatus,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();
  if (broadcastErr || !broadcast) {
    return {
      ok: false,
      error: broadcastErr?.message ?? "Couldn't create broadcast.",
    };
  }

  if (input.scheduleAt) {
    await admin
      .from("comms_proposals")
      .update({
        status: "sent",
        sent_at: input.scheduleAt,
        sent_count: 0,
        broadcast_id: broadcast.id as string,
        draft_subject: subject,
        draft_body_md: bodyMd,
      })
      .eq("id", input.proposalId);
    revalidatePath("/admin/emails");
    return { ok: true, sentCount: 0, failedCount: 0 };
  }

  const recipients = await resolveSegmentRecipients(
    ctx.tenantId,
    input.segment
  );

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
    const rendered = await renderEmail(subject, bodyMd, ctxObj);
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

  const broadcastFinalStatus =
    failed > 0 && sent === 0 ? "failed" : "sent";
  await admin
    .from("email_broadcasts")
    .update({
      status: broadcastFinalStatus,
      sent_count: sent,
      sent_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id);

  await admin
    .from("comms_proposals")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      broadcast_id: broadcast.id as string,
      draft_subject: subject,
      draft_body_md: bodyMd,
    })
    .eq("id", input.proposalId);

  // If this is a bank holiday closure, mark client_email_sent_at on the
  // matching decision so the planner UI hides the "Notify clients" pill.
  await admin
    .from("bank_holiday_decisions")
    .update({ client_email_sent_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .is("client_email_sent_at", null)
    .eq(
      "name",
      stripDateFromSummary(
        (
          await admin
            .from("comms_proposals")
            .select("trigger_summary, trigger_kind")
            .eq("id", input.proposalId)
            .maybeSingle()
        ).data?.trigger_summary ?? ""
      )
    );

  revalidatePath("/admin/emails");
  return { ok: true, sentCount: sent, failedCount: failed };
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] ?? "there";
}

function stripDateFromSummary(summary: string): string {
  // "Closed on Christmas Day (25 Dec 2026)" → "Christmas Day"
  const m = summary.match(/^Closed on (.+?)\s*\(/);
  return m ? m[1] : summary;
}

function stripFences(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  return cleaned;
}
