import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Recognised notification kinds. Mirrors the CHECK constraint in
 * migration 017; keep in sync.
 */
export type NotificationKind =
  | "monthly_payroll_ready"
  | "noshow_charged"
  | "noshow_charge_failed"
  | "late_cancel_charged"
  | "review_received"
  | "google_review_posted"
  | "coach_refreshed"
  | "new_chat_message"
  | "birthday_today"
  | "pack_expiring_soon"
  | "booking_confirmed"
  | "booking_cancelled"
  | "card_declined"
  | "staff_time_off_added"
  | "studio_closure_added"
  | "bank_holiday_reminder";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface InsertInput {
  tenantId: string;
  recipientUserId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  payload?: Record<string, unknown>;
  priority?: NotificationPriority;
  /**
   * Dedupe key — if a notification with the same recipient + kind + key
   * was inserted in the last 60 seconds, skip this one. Defaults to
   * `kind`, which means at most one of a given kind can land per minute
   * per recipient. Pass a more specific key (e.g. a booking id) to
   * dedupe by entity.
   */
  dedupeKey?: string;
  /** Override the default 60-second dedupe window. */
  dedupeWindowSeconds?: number;
}

const DEFAULT_DEDUPE_WINDOW = 60; // seconds

/**
 * Insert a notification with built-in dedupe. Idempotent within the
 * dedupe window — accidentally double-firing the same trigger doesn't
 * spam the user. Returns the notification id (or null if deduped).
 *
 * The dedupe scans the recipient's notifications by (kind, payload key)
 * and skips when a hit is fresher than the window. Uses jsonb path
 * lookup so the `dedupeKey` can be any string written into the
 * payload at insert time.
 */
export async function insertNotification(
  input: InsertInput
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const admin = createAdminSupabase();
  const dedupeKey = input.dedupeKey ?? input.kind;
  const windowSeconds = input.dedupeWindowSeconds ?? DEFAULT_DEDUPE_WINDOW;
  const cutoffIso = new Date(
    Date.now() - windowSeconds * 1000
  ).toISOString();

  // Soft dedupe — read recent of same kind, look for a row with the
  // same dedupe key in the payload. Preferable to a unique index here
  // because dedupe keys are dynamic strings, not table columns.
  const { data: recent } = await admin
    .from("notifications")
    .select("id, payload")
    .eq("recipient_user_id", input.recipientUserId)
    .eq("kind", input.kind)
    .gt("created_at", cutoffIso)
    .limit(20);

  for (const row of (recent ?? []) as Array<{
    id: string;
    payload: Record<string, unknown> | null;
  }>) {
    const existingKey =
      typeof row.payload?._dedupe === "string"
        ? (row.payload._dedupe as string)
        : input.kind;
    if (existingKey === dedupeKey) {
      return { ok: true, id: null };
    }
  }

  const payload: Record<string, unknown> = {
    ...(input.payload ?? {}),
    _dedupe: dedupeKey,
  };

  const { data, error } = await admin
    .from("notifications")
    .insert({
      tenant_id: input.tenantId,
      recipient_user_id: input.recipientUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      action_url: input.actionUrl ?? null,
      payload,
      priority: input.priority ?? "normal",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, id: data.id as string };
}

/**
 * Resolve the user_ids of every owner of a tenant. Used by triggers
 * that need to notify "the owner" (typically just one user, but could
 * be multiple).
 */
export async function getOwnerUserIds(tenantId: string): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  return ((data ?? []) as Array<{ user_id: string }>)
    .map((r) => r.user_id)
    .filter(Boolean);
}

/**
 * Resolve all owner + admin user_ids of a tenant. Used when the
 * notification is broadly admin-relevant (e.g. coach_refreshed).
 */
export async function getOwnerOrAdminUserIds(
  tenantId: string
): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin"]);
  return ((data ?? []) as Array<{ user_id: string }>)
    .map((r) => r.user_id)
    .filter(Boolean);
}

/**
 * Active staff user_ids — used for new-chat-message fan-out.
 */
export async function getActiveStaffUserIds(
  tenantId: string
): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("staff")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("user_id", "is", null);
  return ((data ?? []) as Array<{ user_id: string | null }>)
    .map((r) => r.user_id)
    .filter((v): v is string => !!v);
}
