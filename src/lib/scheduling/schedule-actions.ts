"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { insertNotification } from "@/lib/notifications/insert";
import { createCommsProposal } from "@/lib/comms/proposal-actions";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T = object> = Ok<T> | Err;

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normaliseTime(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!TIME_RE.test(value)) return null;
  return value.length === 5 ? `${value}:00` : value;
}

function isValidDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime());
}

interface AddClosureInput {
  startsOn: string;
  endsOn: string;
  isAllDay: boolean;
  partialStart?: string | null;
  partialEnd?: string | null;
  reason?: string | null;
  serviceId?: string | null;
}

export async function addStudioClosure(
  input: AddClosureInput
): Promise<Result<{ id: string; proposalId: string | null }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can add closures." };
  }
  if (!isValidDate(input.startsOn) || !isValidDate(input.endsOn)) {
    return { ok: false, error: "Invalid date." };
  }
  if (input.startsOn > input.endsOn) {
    return { ok: false, error: "End date can't be before start date." };
  }

  const partialStart = input.isAllDay ? null : normaliseTime(input.partialStart);
  const partialEnd = input.isAllDay ? null : normaliseTime(input.partialEnd);
  if (!input.isAllDay) {
    if (!partialStart || !partialEnd) {
      return { ok: false, error: "Partial closures need a start and end time." };
    }
    if (partialStart >= partialEnd) {
      return { ok: false, error: "End time must be after start time." };
    }
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("tenant_closures")
    .insert({
      tenant_id: ctx.tenantId,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      is_all_day: input.isAllDay,
      partial_start: partialStart,
      partial_end: partialEnd,
      reason: input.reason?.trim() || null,
      service_id: input.serviceId || null,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't add closure." };
  }

  await maybeNotifyClosure({
    tenantId: ctx.tenantId,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    reason: input.reason ?? null,
    serviceId: input.serviceId ?? null,
  });

  // Always offer the "Notify clients?" bar — owner can dismiss in one tap.
  const dateLabel =
    input.startsOn === input.endsOn
      ? formatYmd(input.startsOn)
      : `${formatYmd(input.startsOn)} – ${formatYmd(input.endsOn)}`;
  const summary = input.reason
    ? `Closed on ${input.reason} (${dateLabel})`
    : `Studio closed on ${dateLabel}`;
  const proposal = await createCommsProposal({
    tenantId: ctx.tenantId,
    triggerKind: "studio_closure",
    triggerRefId: data.id as string,
    triggerSummary: summary,
    defaultSegment: { type: "all" },
    createdByUserId: ctx.userId,
  });

  revalidatePath("/admin/settings");
  return {
    ok: true,
    id: data.id as string,
    proposalId: proposal.ok ? proposal.proposalId : null,
  };
}

function formatYmd(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function removeStudioClosure(
  id: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can remove closures." };
  }
  const admin = createAdminSupabase();
  // Capture the closure window + service scope before deletion so the
  // waitlist notify hook knows which dates / service just freed up.
  const { data: closure } = await admin
    .from("tenant_closures")
    .select("starts_on, ends_on, service_id")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  const { error } = await admin
    .from("tenant_closures")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  if (closure) {
    void fanOutWaitlistFromClosure({
      tenantId: ctx.tenantId,
      startsOn: closure.starts_on as string,
      endsOn: closure.ends_on as string,
      serviceId: (closure.service_id as string | null) ?? null,
    });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

interface AddStaffTimeOffInput {
  staffId: string;
  startsOn: string;
  endsOn: string;
  isAllDay: boolean;
  partialStart?: string | null;
  partialEnd?: string | null;
  reason?: string | null;
}

export async function addStaffTimeOff(
  input: AddStaffTimeOffInput
): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) {
    return { ok: false, error: "Not signed in." };
  }
  // Staff can add their own; owner/admin can add anyone's.
  if (!ctx.isOwnerOrAdmin && input.staffId !== ctx.staffId) {
    return { ok: false, error: "You can only manage your own time off." };
  }
  if (!isValidDate(input.startsOn) || !isValidDate(input.endsOn)) {
    return { ok: false, error: "Invalid date." };
  }
  if (input.startsOn > input.endsOn) {
    return { ok: false, error: "End date can't be before start date." };
  }

  const partialStart = input.isAllDay ? null : normaliseTime(input.partialStart);
  const partialEnd = input.isAllDay ? null : normaliseTime(input.partialEnd);
  if (!input.isAllDay) {
    if (!partialStart || !partialEnd) {
      return { ok: false, error: "Partial blocks need a start and end time." };
    }
    if (partialStart >= partialEnd) {
      return { ok: false, error: "End time must be after start time." };
    }
  }

  const admin = createAdminSupabase();

  // Verify the staff member is in the same tenant.
  const { data: staffRow } = await admin
    .from("staff")
    .select("id, display_name, tenant_id")
    .eq("id", input.staffId)
    .maybeSingle();
  if (!staffRow || staffRow.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Staff member not found." };
  }

  const { data, error } = await admin
    .from("staff_time_off")
    .insert({
      tenant_id: ctx.tenantId,
      staff_id: input.staffId,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      is_all_day: input.isAllDay,
      partial_start: partialStart,
      partial_end: partialEnd,
      reason: input.reason?.trim() || null,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't add time off." };
  }

  await notifyOwnersOfStaffTimeOff({
    tenantId: ctx.tenantId,
    staffName: (staffRow.display_name as string) ?? "A team member",
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    actorUserId: ctx.userId,
  });

  revalidatePath("/admin/settings");
  return { ok: true, id: data.id as string };
}

export async function removeStaffTimeOff(id: string): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "Not signed in." };

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("staff_time_off")
    .select("id, tenant_id, staff_id, starts_on, ends_on")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Time off not found." };
  }
  if (!ctx.isOwnerOrAdmin && row.staff_id !== ctx.staffId) {
    return { ok: false, error: "You can only remove your own time off." };
  }

  const { error } = await admin.from("staff_time_off").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  void fanOutWaitlistFromStaffTimeOff({
    tenantId: ctx.tenantId,
    staffId: row.staff_id as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

// -------------------------------------------------------------
// Waitlist fan-out — called when a closure or staff time-off is
// removed, so anyone on the waitlist for those dates gets pinged.
// -------------------------------------------------------------

async function fanOutWaitlistFromClosure(args: {
  tenantId: string;
  startsOn: string;
  endsOn: string;
  serviceId: string | null;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { notifyWaitlistForSlot } = await import("@/lib/waitlist/actions");

    // Pick the services in scope. A studio-wide closure clears every
    // bookable service; a per-service closure clears only that one.
    let serviceIds: string[] = [];
    if (args.serviceId) {
      serviceIds = [args.serviceId];
    } else {
      const { data: services } = await admin
        .from("services")
        .select("id")
        .eq("tenant_id", args.tenantId)
        .eq("is_bookable", true);
      serviceIds = ((services ?? []) as Array<{ id: string }>).map((s) => s.id);
    }

    for (const date of dateRange(args.startsOn, args.endsOn)) {
      for (const sid of serviceIds) {
        await notifyWaitlistForSlot({
          tenantId: args.tenantId,
          serviceId: sid,
          freedDate: date,
          freedStaffId: null,
        });
      }
    }
  } catch (err) {
    console.warn("[schedule] waitlist fan-out (closure) failed", err);
  }
}

async function fanOutWaitlistFromStaffTimeOff(args: {
  tenantId: string;
  staffId: string;
  startsOn: string;
  endsOn: string;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { notifyWaitlistForSlot } = await import("@/lib/waitlist/actions");

    // Services this staff actually performs.
    const { data: links } = await admin
      .from("staff_services")
      .select("service_id")
      .eq("staff_id", args.staffId)
      .eq("tenant_id", args.tenantId);
    const serviceIds = ((links ?? []) as Array<{ service_id: string }>).map(
      (l) => l.service_id
    );
    for (const date of dateRange(args.startsOn, args.endsOn)) {
      for (const sid of serviceIds) {
        await notifyWaitlistForSlot({
          tenantId: args.tenantId,
          serviceId: sid,
          freedDate: date,
          freedStaffId: args.staffId,
        });
      }
    }
  } catch (err) {
    console.warn("[schedule] waitlist fan-out (time-off) failed", err);
  }
}

function dateRange(startsOn: string, endsOn: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${endsOn}T00:00:00`);
  // Cap the range at 31 days to keep the fan-out bounded.
  const maxDays = 31;
  let cursor = start.getTime();
  let count = 0;
  while (cursor <= end.getTime() && count < maxDays) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
    count++;
  }
  return out;
}

// -------------------------------------------------------------
// Notification helpers
// -------------------------------------------------------------

async function maybeNotifyClosure(args: {
  tenantId: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  serviceId: string | null;
}): Promise<void> {
  const startMs = new Date(args.startsOn).getTime();
  const horizonMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (startMs > horizonMs) return; // far enough out, no urgency.

  const admin = createAdminSupabase();
  const { count: affected } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", args.tenantId)
    .gte("starts_at", `${args.startsOn}T00:00:00`)
    .lte("starts_at", `${args.endsOn}T23:59:59.999`)
    .in("status", ["pending", "confirmed"]);

  const dateLabel =
    args.startsOn === args.endsOn
      ? args.startsOn
      : `${args.startsOn} – ${args.endsOn}`;
  const title = `Studio closed on ${dateLabel}${
    affected && affected > 0 ? ` — ${affected} existing bookings` : ""
  }`;

  const supabase = await createServerSupabase();
  const { data: ownerRows } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", args.tenantId)
    .in("role", ["owner", "admin"]);
  const owners = (ownerRows ?? []) as Array<{ user_id: string }>;
  for (const o of owners) {
    await insertNotification({
      tenantId: args.tenantId,
      recipientUserId: o.user_id,
      kind: "studio_closure_added",
      title,
      body: args.reason ?? null,
      actionUrl: "/admin/bookings",
      priority: "high",
    });
  }
}

async function notifyOwnersOfStaffTimeOff(args: {
  tenantId: string;
  staffName: string;
  startsOn: string;
  endsOn: string;
  actorUserId: string;
}): Promise<void> {
  const dateLabel =
    args.startsOn === args.endsOn
      ? args.startsOn
      : `${args.startsOn} – ${args.endsOn}`;
  const title = `${args.staffName} is off ${dateLabel}`;

  const supabase = await createServerSupabase();
  const { data: ownerRows } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", args.tenantId)
    .in("role", ["owner", "admin"]);
  const owners = (ownerRows ?? []) as Array<{ user_id: string }>;
  for (const o of owners) {
    if (o.user_id === args.actorUserId) continue; // don't ping the actor
    await insertNotification({
      tenantId: args.tenantId,
      recipientUserId: o.user_id,
      kind: "staff_time_off_added",
      title,
      body: null,
      actionUrl: "/admin/settings",
      priority: "normal",
    });
  }
}
