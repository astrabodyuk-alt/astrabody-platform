"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";
import { createCommsProposal } from "@/lib/comms/proposal-actions";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Update a staff member's profile (display_name / bio_short / specialties /
 * photo_url). Self-edit always allowed; owner/admin can edit anyone's.
 */
export async function updateStaffProfile(input: {
  staffId: string;
  display_name?: string;
  bio_short?: string;
  specialties?: string[];
  photo_url?: string | null;
  commission_rate_pct?: number;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  if (input.staffId !== ctx.staffId && !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "you can only edit your own profile" };
  }

  // Commission rate is owner / admin only — never self-editable.
  if (input.commission_rate_pct !== undefined && !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "owner / admin only for commission rate" };
  }

  const update: Record<string, unknown> = {};
  if (input.display_name !== undefined) {
    const trimmed = input.display_name.trim();
    if (!trimmed) return { ok: false, error: "name can't be empty" };
    update.display_name = trimmed;
  }
  if (input.bio_short !== undefined) {
    const trimmed = input.bio_short.trim();
    if (trimmed.length > 160) {
      return { ok: false, error: "bio must be 160 characters or fewer" };
    }
    update.bio_short = trimmed || null;
  }
  if (input.specialties !== undefined) {
    update.specialties = input.specialties
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (input.photo_url !== undefined) {
    update.photo_url = input.photo_url;
  }
  if (input.commission_rate_pct !== undefined) {
    const rate = input.commission_rate_pct;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { ok: false, error: "commission rate must be 0–100" };
    }
    // Clamp to 2dp to match numeric(5,2).
    update.commission_rate_pct = Math.round(rate * 100) / 100;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const admin = createAdminSupabase();
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id")
    .eq("id", input.staffId)
    .maybeSingle();
  if (!staff || staff.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "staff not in your tenant" };
  }

  const { error } = await admin
    .from("staff")
    .update(update)
    .eq("id", input.staffId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/payroll");
  revalidatePath("/portal/book");
  return { ok: true };
}

export async function updateTenantConfig(input: {
  name?: string;
  brand_primary?: string;
  brand_secondary?: string;
  timezone?: string;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const update: Record<string, unknown> = {};
  if (input.name?.trim()) update.name = input.name.trim();
  if (input.brand_primary?.match(/^#[0-9A-Fa-f]{6}$/))
    update.brand_primary = input.brand_primary;
  if (input.brand_secondary?.match(/^#[0-9A-Fa-f]{6}$/))
    update.brand_secondary = input.brand_secondary;
  if (input.timezone?.trim()) update.timezone = input.timezone.trim();
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update(update)
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Update the cancellation-policy knobs on tenants. Owner / admin only.
 * Sliders / inputs are clamped to sensible ranges before saving.
 */
export async function updateCancellationPolicy(input: {
  enabled: boolean;
  noshowChargePct: number;
  lateCancelChargePct: number;
  lateCancelCutoffHours: number;
  customText?: string | null;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const noshow = clampInt(input.noshowChargePct, 0, 100);
  const late = clampInt(input.lateCancelChargePct, 0, 100);
  const cutoff = clampInt(input.lateCancelCutoffHours, 0, 168);
  const customText =
    typeof input.customText === "string"
      ? input.customText.trim() || null
      : null;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update({
      cancellation_policy_enabled: input.enabled,
      noshow_charge_pct: noshow,
      late_cancel_charge_pct: late,
      late_cancel_cutoff_hours: cutoff,
      cancellation_policy_text: customText,
    })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/bookings");
  revalidatePath("/portal/book");
  return { ok: true };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Upsert a service_resources row. Owner / admin only. The
 * (service_id, name) unique index keeps duplicate names from sneaking
 * in. Caller passes id when editing, omits when creating.
 */
export async function upsertServiceResource(input: {
  id?: string;
  serviceId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive: boolean;
}): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "name is required" };

  const admin = createAdminSupabase();
  const { data: svc } = await admin
    .from("services")
    .select("id, tenant_id")
    .eq("id", input.serviceId)
    .maybeSingle();
  if (!svc || svc.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "service not in your tenant" };
  }

  const row = {
    tenant_id: ctx.tenantId,
    service_id: input.serviceId,
    name,
    description: input.description?.trim() || null,
    sort_order: clampInt(input.sortOrder ?? 100, 0, 9999),
    is_active: input.isActive,
  };

  if (input.id) {
    const { data: existing } = await admin
      .from("service_resources")
      .select("tenant_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.tenant_id !== ctx.tenantId) {
      return { ok: false, error: "resource not in your tenant" };
    }
    const { error } = await admin
      .from("service_resources")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/settings");
    revalidatePath("/portal/book");
    return { ok: true, id: input.id };
  }
  const { data: created, error } = await admin
    .from("service_resources")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "couldn't save" };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/portal/book");
  return { ok: true, id: created.id as string };
}

/**
 * Delete a resource. Refuses if the resource is bound to any future
 * booking (status pending / confirmed) — owner must reassign those
 * first via the admin booking sheet. Owner / admin only.
 */
export async function deleteServiceResource(
  resourceId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("service_resources")
    .select("tenant_id")
    .eq("id", resourceId)
    .maybeSingle();
  if (!existing || existing.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "resource not in your tenant" };
  }

  const nowIso = new Date().toISOString();
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("resource_id", resourceId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", nowIso);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "There are future bookings on this resource. Move those first.",
    };
  }

  const { error } = await admin
    .from("service_resources")
    .delete()
    .eq("id", resourceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/portal/book");
  return { ok: true };
}

/**
 * Update the tenant-wide reschedule cutoff (hours before start a
 * client can still self-move). Owner / admin only. Clamped to 0–168h.
 */
export async function updateRescheduleCutoff(
  hours: number
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };
  const safe = clampInt(hours, 0, 168);
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update({ reschedule_cutoff_hours: safe })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Update the review-engine knobs on tenants. Owner / admin only.
 * The Google URL is validated only loosely — Google deep-links can
 * take several formats (g.page/r/<id>/review, search.google.com/...,
 * maps.app.goo.gl/...). We just enforce https://.
 */
export async function updateReviewSettings(input: {
  googleBusinessReviewUrl: string | null;
  reviewBonusVoucherPct: number;
  reviewRequestsPaused: boolean;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const trimmedUrl = input.googleBusinessReviewUrl?.trim() ?? "";
  let urlForDb: string | null = null;
  if (trimmedUrl) {
    if (!/^https:\/\//i.test(trimmedUrl)) {
      return { ok: false, error: "Google review URL must start with https://" };
    }
    urlForDb = trimmedUrl;
  }
  const pct = clampInt(input.reviewBonusVoucherPct, 0, 100);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update({
      google_business_review_url: urlForDb,
      review_bonus_voucher_pct: pct,
      review_requests_paused: input.reviewRequestsPaused,
    })
    .eq("id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Change a tenant_member's role. Owner-only — admins can't promote
 * each other or themselves.
 */
export async function setMemberRole(input: {
  userId: string;
  role: "owner" | "admin" | "staff" | "viewer";
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (ctx.role !== "owner") return { ok: false, error: "owner only" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenant_members")
    .update({ role: input.role })
    .eq("user_id", input.userId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Create or update a service_packages row. Owner-only (catalogue is a
 * pricing decision). On update, only `is_active` and editable fields
 * are touched — sessions_count + price + validity may differ from past
 * sold packs, but that's fine because client_packages snapshots all
 * three at sale time.
 */
export async function upsertServicePackage(input: {
  id?: string;
  serviceId: string;
  name: string;
  shortDescription?: string | null;
  sessionsCount: number;
  pricePence: number;
  validityMonths: number;
  isActive: boolean;
  sortOrder?: number;
}): Promise<Result<{ id: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (ctx.role !== "owner") return { ok: false, error: "owner only" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "name is required" };
  if (!Number.isFinite(input.sessionsCount) || input.sessionsCount < 1) {
    return { ok: false, error: "sessions count must be at least 1" };
  }
  if (!Number.isFinite(input.pricePence) || input.pricePence < 0) {
    return { ok: false, error: "price can't be negative" };
  }
  if (!Number.isFinite(input.validityMonths) || input.validityMonths < 1) {
    return { ok: false, error: "validity must be at least 1 month" };
  }

  const admin = createAdminSupabase();

  // Verify the service belongs to this tenant (defence in depth — RLS
  // would block a write but the error message is clearer here).
  const { data: svc } = await admin
    .from("services")
    .select("id, tenant_id")
    .eq("id", input.serviceId)
    .maybeSingle();
  if (!svc || svc.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "service not in your tenant" };
  }

  const row = {
    tenant_id: ctx.tenantId,
    service_id: input.serviceId,
    name,
    short_description: input.shortDescription?.trim() || null,
    sessions_count: Math.round(input.sessionsCount),
    price_pence: Math.round(input.pricePence),
    validity_months: Math.round(input.validityMonths),
    is_active: input.isActive,
    sort_order: input.sortOrder ?? 100,
  };

  if (input.id) {
    const { data: existing } = await admin
      .from("service_packages")
      .select("tenant_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!existing || existing.tenant_id !== ctx.tenantId) {
      return { ok: false, error: "pack not in your tenant" };
    }
    const { error } = await admin
      .from("service_packages")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/settings");
    revalidatePath("/admin/sales/new");
    return { ok: true, id: input.id };
  }

  const { data: created, error } = await admin
    .from("service_packages")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "couldn't create pack" };
  }

  // New pack → propose telling clients about it.
  void createCommsProposal({
    tenantId: ctx.tenantId,
    triggerKind: "new_package",
    triggerRefId: created.id as string,
    triggerSummary: `New pack: ${name} at £${(input.pricePence / 100).toFixed(2)}`,
    defaultSegment: { type: "all" },
    createdByUserId: ctx.userId,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/sales/new");
  return { ok: true, id: created.id as string };
}

/**
 * Replace the working_hours rows for the current staff (or any staff
 * if owner/admin specifies staffId). Idempotent — wipes existing rows
 * for the staff and re-inserts.
 *
 * input.hours = array of { weekday: 0-6, start: "HH:MM", end: "HH:MM" }
 */
export async function setWorkingHours(input: {
  staffId: string;
  hours: Array<{ weekday: number; start: string; end: string }>;
}): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  // If editing someone else's hours, must be owner/admin.
  if (input.staffId !== ctx.staffId && !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "you can only edit your own hours" };
  }

  // Validate
  for (const h of input.hours) {
    if (h.weekday < 0 || h.weekday > 6) return { ok: false, error: "bad weekday" };
    if (!/^\d{2}:\d{2}$/.test(h.start) || !/^\d{2}:\d{2}$/.test(h.end))
      return { ok: false, error: "bad time format (HH:MM)" };
    if (h.start >= h.end) return { ok: false, error: "start must be before end" };
  }

  const admin = createAdminSupabase();

  // Verify staff belongs to this tenant.
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id")
    .eq("id", input.staffId)
    .maybeSingle();
  if (!staff || staff.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "staff not in your tenant" };
  }

  // Wipe + reinsert (admin client because we need DELETE + bulk INSERT).
  await admin
    .from("working_hours")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("staff_id", input.staffId);

  if (input.hours.length > 0) {
    const rows = input.hours.map((h) => ({
      tenant_id: ctx.tenantId,
      staff_id: input.staffId,
      weekday: h.weekday,
      start_time: `${h.start}:00`,
      end_time: `${h.end}:00`,
    }));
    const { error } = await admin.from("working_hours").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  // Universal "Notify clients?" hook. Fire-and-forget; the bar surfaces
  // in /admin/emails Pending announcements when this isn't an inline
  // call site.
  if (ctx.isOwnerOrAdmin) {
    const summary = describeHoursSummary(input.hours);
    void createCommsProposal({
      tenantId: ctx.tenantId,
      triggerKind: "working_hours_change",
      triggerRefId: null,
      triggerSummary: summary,
      defaultSegment: { type: "all" },
      createdByUserId: ctx.userId,
    });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

function describeHoursSummary(
  hours: Array<{ weekday: number; start: string; end: string }>
): string {
  if (hours.length === 0) return "Working hours updated";
  const dayName = (w: number): string =>
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w] ?? "Day";
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const parts = sorted.map((h) => `${dayName(h.weekday)} ${h.start}–${h.end}`);
  return `Opening hours updated: ${parts.join(", ")}`;
}
