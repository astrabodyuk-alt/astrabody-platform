"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { insertNotification } from "@/lib/notifications/insert";
import { createCommsProposal } from "@/lib/comms/proposal-actions";

// ----- Types shared with the client drawer -----

export type ChangeType =
  | "add_staff_time_off"
  | "remove_staff_time_off"
  | "add_tenant_closure"
  | "remove_tenant_closure"
  | "update_working_hours"
  | "update_commission_rate"
  | "update_service_price"
  | "update_cancellation_policy"
  | "update_review_settings";

export interface ProposedChange {
  type: ChangeType;
  description: string;
  params: Record<string, unknown>;
}

export interface AssistantPlan {
  summary: string;
  changes: ProposedChange[];
  clarification_needed: string | null;
}

export interface AssistantContext {
  tenantName: string;
  timezone: string;
  workingHours: Array<{
    staff_id: string;
    weekday: number;
    start: string;
    end: string;
  }>;
  staff: Array<{
    id: string;
    name: string;
    role: string | null;
    commission_rate_pct: number | null;
  }>;
  services: Array<{ id: string; name: string }>;
  closures: Array<{
    id: string;
    starts_on: string;
    ends_on: string;
    reason: string | null;
    service_name: string | null;
  }>;
  staffTimeOff: Array<{
    id: string;
    staff_id: string;
    staff_name: string;
    starts_on: string;
    ends_on: string;
    reason: string | null;
  }>;
  cancellationPolicy: {
    enabled: boolean;
    noshow_charge_pct: number;
    late_cancel_charge_pct: number;
    late_cancel_cutoff_hours: number;
    custom_text: string | null;
  };
  reviewSettings: {
    google_business_review_url: string | null;
    review_bonus_voucher_pct: number;
  };
}

export type InterpretResult =
  | {
      ok: true;
      logId: string;
      plan: AssistantPlan;
      conversationalReply: string | null;
    }
  | { ok: false; error: string };

export type ApplyResult =
  | { ok: true; appliedCount: number }
  | { ok: false; error: string };

const RATE_LIMIT_PER_HOUR = 30;

const SYSTEM_PROMPT = `You are a settings assistant for a premium UK beauty / wellness studio. The owner asks you to make changes to their studio settings. You produce a precise, structured change plan — nothing more.

You will receive the current settings as JSON context and the owner's plain-English request.

Hard rules:
- Use UK English. No em-dashes.
- Never invent prices, staff names, or services. If something is referenced that is not in the context, set clarification_needed and return changes: [].
- Never propose changes outside the allowed change types listed below. If asked, set changes: [] and explain in summary that you can only manage schedule and settings.
- Read-only requests (e.g. "what are our hours?", "who is off this week?") get summary set to a plain-English answer based on the context, changes: [], clarification_needed: null.
- All dates are in YYYY-MM-DD. All times are HH:MM 24-hour.
- "today" / "tomorrow" / "next Monday" must be resolved against the date provided in context. If a relative date is genuinely ambiguous (e.g. two valid Fridays in scope), set clarification_needed.

Allowed change types and their params shape:
- add_staff_time_off  { staff_id, starts_on, ends_on, is_all_day, partial_start?, partial_end?, reason }
- remove_staff_time_off  { time_off_id }
- add_tenant_closure  { starts_on, ends_on, is_all_day, partial_start?, partial_end?, reason, service_id? }
- remove_tenant_closure  { closure_id }
- update_working_hours  { staff_id, weekday (0=Sun..6=Sat), start, end, is_closed }
- update_commission_rate  { staff_id, new_rate_pct }
- update_service_price  { service_id, new_price_pence }
- update_cancellation_policy  { noshow_charge_pct?, late_cancel_charge_pct?, late_cancel_cutoff_hours?, cancellation_policy_text? }
- update_review_settings  { google_business_review_url?, review_bonus_voucher_pct? }

Respond ONLY with a single JSON object:
{ "summary": "...", "changes": [...], "clarification_needed": null | "..." }
No prose, no markdown fences.`;

// -------------------------------------------------------------
// interpretSettingsRequest
// -------------------------------------------------------------

export async function interpretSettingsRequest(args: {
  message: string;
  context: AssistantContext;
}): Promise<InterpretResult> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can use the assistant." };
  }

  const message = args.message.trim();
  if (!message) {
    return { ok: false, error: "Type a message first." };
  }
  if (message.length > 2000) {
    return { ok: false, error: "Message too long (max 2000 chars)." };
  }

  // Rate limit: 30 requests / tenant / rolling hour.
  const admin = createAdminSupabase();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("settings_ai_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      error: "Slow down — you can make 30 changes per hour via the assistant.",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI is not configured." };
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: args.context.timezone,
  });

  const userBlock = JSON.stringify(
    {
      today,
      timezone: args.context.timezone,
      request: message,
      context: args.context,
    },
    null,
    2
  );

  const client = new Anthropic({ apiKey });
  let plan: AssistantPlan;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
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
    plan = parsePlan(text);
  } catch (err) {
    console.error("[ai-assistant] interpret failed", err);
    return { ok: false, error: "Couldn't reach the assistant — try again." };
  }

  // Validate every proposed change against the context. Any reference to
  // a staff_id, service_id, time_off_id or closure_id that doesn't exist
  // is converted into a clarification.
  const validation = validatePlan(plan, args.context);
  if (validation.error) {
    plan = {
      summary: "I need a bit more info before I can make that change.",
      changes: [],
      clarification_needed: validation.error,
    };
  }

  const { data: logRow, error: logError } = await admin
    .from("settings_ai_log")
    .insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      user_message: message,
      assistant_plan: plan,
      was_confirmed: null,
    })
    .select("id")
    .single();
  if (logError || !logRow) {
    return { ok: false, error: "Couldn't log the request." };
  }

  return {
    ok: true,
    logId: logRow.id as string,
    plan,
    conversationalReply: plan.changes.length === 0 ? plan.summary : null,
  };
}

// -------------------------------------------------------------
// applySettingsChanges
// -------------------------------------------------------------

export async function applySettingsChanges(
  logId: string
): Promise<ApplyResult> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can apply changes." };
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("settings_ai_log")
    .select("id, tenant_id, assistant_plan, was_confirmed")
    .eq("id", logId)
    .maybeSingle();
  if (!row || row.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Plan not found." };
  }
  if (row.was_confirmed !== null) {
    return { ok: false, error: "This plan has already been resolved." };
  }
  const plan = row.assistant_plan as AssistantPlan | null;
  if (!plan || plan.changes.length === 0) {
    return { ok: false, error: "Nothing to apply." };
  }

  let applied = 0;
  for (const change of plan.changes) {
    const ok = await applyChange(change, ctx.tenantId, ctx.userId);
    if (!ok) {
      console.warn("[ai-assistant] change failed", change);
      continue;
    }
    applied++;
  }

  await admin
    .from("settings_ai_log")
    .update({ was_confirmed: true, applied_at: new Date().toISOString() })
    .eq("id", logId);

  revalidatePath("/admin/settings");
  return { ok: true, appliedCount: applied };
}

export async function rejectSettingsPlan(logId: string): Promise<ApplyResult> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can reject changes." };
  }
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("settings_ai_log")
    .update({ was_confirmed: false })
    .eq("id", logId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, appliedCount: 0 };
}

// -------------------------------------------------------------
// internals
// -------------------------------------------------------------

function parsePlan(raw: string): AssistantPlan {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      summary: "I couldn't understand that — try rephrasing.",
      changes: [],
      clarification_needed: null,
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      summary: "I couldn't understand that — try rephrasing.",
      changes: [],
      clarification_needed: null,
    };
  }
  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const clarification =
    typeof obj.clarification_needed === "string"
      ? obj.clarification_needed
      : null;
  const changes = Array.isArray(obj.changes)
    ? (obj.changes as ProposedChange[]).filter(
        (c) =>
          c &&
          typeof c.type === "string" &&
          typeof c.description === "string" &&
          c.params &&
          typeof c.params === "object"
      )
    : [];
  return { summary, changes, clarification_needed: clarification };
}

function validatePlan(
  plan: AssistantPlan,
  ctx: AssistantContext
): { error: string | null } {
  const staffIds = new Set(ctx.staff.map((s) => s.id));
  const serviceIds = new Set(ctx.services.map((s) => s.id));
  const closureIds = new Set(ctx.closures.map((c) => c.id));
  const timeOffIds = new Set(ctx.staffTimeOff.map((t) => t.id));

  for (const c of plan.changes) {
    const p = c.params as Record<string, unknown>;
    if (
      (c.type === "add_staff_time_off" ||
        c.type === "update_working_hours" ||
        c.type === "update_commission_rate") &&
      typeof p.staff_id === "string" &&
      !staffIds.has(p.staff_id)
    ) {
      return { error: "I couldn't match that staff member — could you clarify?" };
    }
    if (
      (c.type === "add_tenant_closure" || c.type === "update_service_price") &&
      typeof p.service_id === "string" &&
      p.service_id.length > 0 &&
      !serviceIds.has(p.service_id)
    ) {
      return { error: "I couldn't match that service — could you clarify?" };
    }
    if (
      c.type === "remove_tenant_closure" &&
      typeof p.closure_id === "string" &&
      !closureIds.has(p.closure_id)
    ) {
      return { error: "That closure isn't in your upcoming list anymore." };
    }
    if (
      c.type === "remove_staff_time_off" &&
      typeof p.time_off_id === "string" &&
      !timeOffIds.has(p.time_off_id)
    ) {
      return { error: "That time-off entry isn't in your upcoming list anymore." };
    }
  }
  return { error: null };
}

async function applyChange(
  change: ProposedChange,
  tenantId: string,
  userId: string
): Promise<boolean> {
  const admin = createAdminSupabase();
  const p = change.params as Record<string, unknown>;
  try {
    switch (change.type) {
      case "add_staff_time_off": {
        const { error } = await admin.from("staff_time_off").insert({
          tenant_id: tenantId,
          staff_id: String(p.staff_id),
          starts_on: String(p.starts_on),
          ends_on: String(p.ends_on),
          is_all_day: p.is_all_day !== false,
          partial_start: p.is_all_day === false ? p.partial_start ?? null : null,
          partial_end: p.is_all_day === false ? p.partial_end ?? null : null,
          reason: typeof p.reason === "string" ? p.reason : null,
          created_by_user_id: userId,
        });
        if (error) return false;
        await maybeNotifyStaffTimeOff(tenantId, String(p.staff_id), userId);
        return true;
      }
      case "remove_staff_time_off": {
        const { error } = await admin
          .from("staff_time_off")
          .delete()
          .eq("id", String(p.time_off_id))
          .eq("tenant_id", tenantId);
        return !error;
      }
      case "add_tenant_closure": {
        const { error } = await admin.from("tenant_closures").insert({
          tenant_id: tenantId,
          starts_on: String(p.starts_on),
          ends_on: String(p.ends_on),
          is_all_day: p.is_all_day !== false,
          partial_start: p.is_all_day === false ? p.partial_start ?? null : null,
          partial_end: p.is_all_day === false ? p.partial_end ?? null : null,
          reason: typeof p.reason === "string" ? p.reason : null,
          service_id: typeof p.service_id === "string" ? p.service_id : null,
          created_by_user_id: userId,
        });
        if (error) return false;
        await maybeNotifyClosure(
          tenantId,
          String(p.starts_on),
          String(p.ends_on),
          typeof p.reason === "string" ? p.reason : null
        );
        return true;
      }
      case "remove_tenant_closure": {
        const { error } = await admin
          .from("tenant_closures")
          .delete()
          .eq("id", String(p.closure_id))
          .eq("tenant_id", tenantId);
        return !error;
      }
      case "update_working_hours": {
        const staffId = String(p.staff_id);
        const weekday = Number(p.weekday);
        if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) return false;

        // Wipe existing rows for that staff/weekday and insert the new
        // window. is_closed leaves no row.
        await admin
          .from("working_hours")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("staff_id", staffId)
          .eq("weekday", weekday);
        if (p.is_closed === true) return true;
        const { error } = await admin.from("working_hours").insert({
          tenant_id: tenantId,
          staff_id: staffId,
          weekday,
          start_time: normaliseTimeValue(p.start),
          end_time: normaliseTimeValue(p.end),
        });
        return !error;
      }
      case "update_commission_rate": {
        const rate = Number(p.new_rate_pct);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) return false;
        const { error } = await admin
          .from("staff")
          .update({ commission_rate_pct: rate })
          .eq("id", String(p.staff_id))
          .eq("tenant_id", tenantId);
        return !error;
      }
      case "update_service_price": {
        const cents = Number(p.new_price_pence);
        if (!Number.isFinite(cents) || cents < 0 || cents > 10_000_00) return false;
        const { data: existing } = await admin
          .from("services")
          .select("name")
          .eq("id", String(p.service_id))
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const { error } = await admin
          .from("services")
          .update({ price_pence: Math.round(cents) })
          .eq("id", String(p.service_id))
          .eq("tenant_id", tenantId);
        if (error) return false;
        if (existing) {
          void createCommsProposal({
            tenantId,
            triggerKind: "service_price_change",
            triggerRefId: String(p.service_id),
            triggerSummary: `${existing.name as string} price updated to £${(cents / 100).toFixed(2)}`,
            defaultSegment: {
              type: "service",
              params: { serviceId: String(p.service_id) },
            },
            createdByUserId: userId,
          });
        }
        return true;
      }
      case "update_cancellation_policy": {
        const patch: Record<string, unknown> = {};
        if (typeof p.noshow_charge_pct === "number")
          patch.noshow_charge_pct = p.noshow_charge_pct;
        if (typeof p.late_cancel_charge_pct === "number")
          patch.late_cancel_charge_pct = p.late_cancel_charge_pct;
        if (typeof p.late_cancel_cutoff_hours === "number")
          patch.late_cancel_cutoff_hours = p.late_cancel_cutoff_hours;
        if (typeof p.cancellation_policy_text === "string")
          patch.cancellation_policy_text = p.cancellation_policy_text;
        if (Object.keys(patch).length === 0) return false;
        const { error } = await admin
          .from("tenants")
          .update(patch)
          .eq("id", tenantId);
        return !error;
      }
      case "update_review_settings": {
        const patch: Record<string, unknown> = {};
        if (typeof p.google_business_review_url === "string")
          patch.google_business_review_url = p.google_business_review_url;
        if (typeof p.review_bonus_voucher_pct === "number")
          patch.review_bonus_voucher_pct = p.review_bonus_voucher_pct;
        if (Object.keys(patch).length === 0) return false;
        const { error } = await admin
          .from("tenants")
          .update(patch)
          .eq("id", tenantId);
        return !error;
      }
      default:
        return false;
    }
  } catch (err) {
    console.warn("[ai-assistant] change threw", err);
    return false;
  }
}

function normaliseTimeValue(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.length === 5 ? `${s}:00` : s;
}

async function maybeNotifyClosure(
  tenantId: string,
  startsOn: string,
  endsOn: string,
  reason: string | null
): Promise<void> {
  const startMs = new Date(startsOn).getTime();
  if (startMs > Date.now() + 7 * 24 * 60 * 60 * 1000) return;
  const admin = createAdminSupabase();
  const { data: ownerRows } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin"]);
  const dateLabel = startsOn === endsOn ? startsOn : `${startsOn} – ${endsOn}`;
  for (const o of (ownerRows ?? []) as Array<{ user_id: string }>) {
    await insertNotification({
      tenantId,
      recipientUserId: o.user_id,
      kind: "studio_closure_added",
      title: `Studio closed on ${dateLabel}`,
      body: reason,
      actionUrl: "/admin/bookings",
      priority: "high",
    });
  }
}

async function maybeNotifyStaffTimeOff(
  tenantId: string,
  staffId: string,
  actorUserId: string
): Promise<void> {
  const admin = createAdminSupabase();
  const [{ data: staffRow }, { data: ownerRows }] = await Promise.all([
    admin.from("staff").select("display_name").eq("id", staffId).maybeSingle(),
    admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"]),
  ]);
  const name = (staffRow?.display_name as string | undefined) ?? "A team member";
  for (const o of (ownerRows ?? []) as Array<{ user_id: string }>) {
    if (o.user_id === actorUserId) continue;
    await insertNotification({
      tenantId,
      recipientUserId: o.user_id,
      kind: "staff_time_off_added",
      title: `${name} has new time off`,
      body: null,
      actionUrl: "/admin/settings",
      priority: "normal",
    });
  }
}
