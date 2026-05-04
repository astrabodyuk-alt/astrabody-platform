import "server-only";
import type { NotificationKind, NotificationPriority } from "./insert";

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  actionUrl: string | null;
  priority: NotificationPriority;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const SELECT_COLS =
  "id, kind, title, body, action_url, priority, payload, read_at, created_at";

/**
 * Latest 30 notifications for the current admin user. Used by the bell
 * dropdown. Reads via the user-scoped client so RLS scopes by
 * `recipient_user_id = auth.uid()` automatically.
 */
export async function getRecentNotifications(): Promise<NotificationView[]> {
  return getNotificationsImpl(30);
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await getUserClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

export async function getUnreadCountsByKind(): Promise<
  Record<string, number>
> {
  const supabase = await getUserClient();
  // RLS already filters to the current user.
  const { data } = await supabase
    .from("notifications")
    .select("kind")
    .is("read_at", null);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ kind: string }>) {
    out[row.kind] = (out[row.kind] ?? 0) + 1;
  }
  return out;
}

/**
 * Up-to-3 unread urgent or actionable notifications for the home
 * banner. Spec calls these out: priority='urgent' OR kind in
 * (monthly_payroll_ready, noshow_charge_failed, card_declined).
 */
export async function getHomeBannerNotifications(): Promise<NotificationView[]> {
  const supabase = await getUserClient();
  const { data } = await supabase
    .from("notifications")
    .select(SELECT_COLS)
    .is("read_at", null)
    .or(
      "priority.eq.urgent,kind.in.(monthly_payroll_ready,noshow_charge_failed,card_declined)"
    )
    .order("created_at", { ascending: false })
    .limit(3);
  return shapeRows(data);
}

// ---- internals -------------------------------------------------------

async function getNotificationsImpl(limit: number): Promise<NotificationView[]> {
  const supabase = await getUserClient();
  const { data } = await supabase
    .from("notifications")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  return shapeRows(data);
}

async function getUserClient() {
  const mod = await import("@/lib/supabase/server");
  return mod.createServerSupabase();
}

function shapeRows(data: unknown): NotificationView[] {
  return (
    (data ?? []) as Array<{
      id: string;
      kind: NotificationKind;
      title: string;
      body: string | null;
      action_url: string | null;
      priority: NotificationPriority;
      payload: Record<string, unknown> | null;
      read_at: string | null;
      created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    actionUrl: r.action_url,
    priority: r.priority,
    payload: r.payload ?? {},
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}
