"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPortalContext } from "@/lib/portal/booking-queries";
import { sendWebPushToClient } from "@/lib/comms/sendWebPushToClient";

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  tenant_id: string;
  sender_client_id: string | null;
  sender_staff_id: string | null;
  author_type: "client" | "staff" | "bot" | "system";
  body: string | null;
  attachments: unknown;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  primary_channel: string | null;
}

export interface GetOrCreateThreadResult {
  threadId: string;
  /** Newly created on this call (so we just inserted the welcome bot message). */
  created: boolean;
  /** Initial message log, ascending. */
  messages: ChatMessageRow[];
}

/**
 * Find or create the in-app chat thread for the current portal client.
 * Idempotent. On first creation, also inserts the welcome bot message.
 *
 * Uses the admin client because:
 *   - Inserting a chat_messages row with author_type='bot' violates the
 *     chat_messages_client RLS WITH CHECK (which allows only client-authored
 *     rows from the user-scoped client).
 */
export async function getOrCreateClientThread(): Promise<GetOrCreateThreadResult> {
  const { clientId, tenantId } = await getPortalContext();
  const admin = createAdminSupabase();

  // Resolve the client's first name for the welcome copy.
  const { data: client } = await admin
    .from("clients")
    .select("full_name")
    .eq("id", clientId)
    .maybeSingle();
  const firstName = deriveFirstName((client?.full_name as string | null) ?? "");

  // Find existing in_app thread.
  const { data: existing } = await admin
    .from("chat_threads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("channel", "in_app")
    .maybeSingle();

  let threadId: string;
  let created = false;

  if (existing) {
    threadId = existing.id as string;
  } else {
    const { data: inserted, error } = await admin
      .from("chat_threads")
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        channel: "in_app",
        status: "open",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`couldn't create thread: ${error?.message ?? "no row"}`);
    }
    threadId = inserted.id as string;
    created = true;

    // Welcome bot message. UK English, single ✨, no em-dashes.
    const welcomeBody = `Hi ${firstName}, this is Astrabody. We're here for anything: booking questions, treatment advice, even on the day of your session. Happy to have you ✨`;
    await admin.from("chat_messages").insert({
      tenant_id: tenantId,
      thread_id: threadId,
      sender_client_id: null,
      sender_staff_id: null,
      author_type: "bot",
      body: welcomeBody,
      primary_channel: "in_app_push",
    });
    // Best-effort push (no-op if no active subscription). Skipped silently
    // on the very first chat open since the user is already on the page,
    // but kept for parity with future staff messages — tag deduplicates.
    void sendWebPushToClient(clientId, {
      title: "Astrabody",
      body: shorten(welcomeBody, 80),
      url: "/portal/chat",
      tag: `chat-${threadId}`,
    });
  }

  // Load the message log ascending. Use the user-scoped client so RLS is
  // exercised (chat_messages_client allows SELECT on any message in
  // threads owned by the current portal client).
  const supabase = await createServerSupabase();
  const { data: messages, error: msgError } = await supabase
    .from("chat_messages")
    .select(
      "id, thread_id, tenant_id, sender_client_id, sender_staff_id, author_type, body, attachments, delivered_at, read_at, created_at, primary_channel"
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (msgError) throw msgError;

  return {
    threadId,
    created,
    messages: (messages ?? []) as ChatMessageRow[],
  };
}

/**
 * Insert a client-authored message. RLS allows the user-scoped client
 * to insert rows where author_type='client' AND sender_client_id matches
 * the current portal client.
 */
export async function sendClientMessage(input: {
  threadId: string;
  body: string;
}): Promise<{ ok: true; message: ChatMessageRow } | { ok: false; error: string }> {
  const trimmed = input.body.trim();
  if (!trimmed) return { ok: false, error: "empty message" };
  if (trimmed.length > 4000) return { ok: false, error: "message too long" };

  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return { ok: false, error: "no session" };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      tenant_id: portal.tenantId,
      thread_id: input.threadId,
      sender_client_id: portal.clientId,
      sender_staff_id: null,
      author_type: "client",
      body: trimmed,
      primary_channel: "in_app_push",
    })
    .select(
      "id, thread_id, tenant_id, sender_client_id, sender_staff_id, author_type, body, attachments, delivered_at, read_at, created_at, primary_channel"
    )
    .single();
  if (error || !data) {
    console.error("[chat/sendClientMessage] insert failed", error);
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  // Fan out a chat notification to active staff. Dedupe key is the
  // thread id so multiple messages within 60s collapse into one
  // ping per staff member ("you have N messages from Lisa" is too
  // aggressive for V1 — collapse silently).
  try {
    const { insertNotification, getActiveStaffUserIds } = await import(
      "@/lib/notifications/insert"
    );
    const { createAdminSupabase: createAdmin } = await import(
      "@/lib/supabase/admin"
    );
    const admin = createAdmin();
    const { data: client } = await admin
      .from("clients")
      .select("full_name")
      .eq("id", portal.clientId)
      .maybeSingle();
    const firstName =
      ((client?.full_name as string | null) ?? "")
        .trim()
        .split(/\s+/)[0] || "A client";
    const staffIds = await getActiveStaffUserIds(portal.tenantId);
    for (const userId of staffIds) {
      await insertNotification({
        tenantId: portal.tenantId,
        recipientUserId: userId,
        kind: "new_chat_message",
        priority: "normal",
        title: `New message from ${firstName}`,
        body: trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed,
        actionUrl: `/admin/inbox?thread=${input.threadId}`,
        payload: { thread_id: input.threadId },
        dedupeKey: `chat:${input.threadId}`,
        // 1h dedupe so chatty clients don't spam the bell.
        dedupeWindowSeconds: 60 * 60,
      });
    }
  } catch (e) {
    console.warn("[chat/sendClientMessage] notification failed:", e);
  }

  return { ok: true, message: data as ChatMessageRow };
}

/**
 * Mark every staff/bot message in this thread as read by the client and
 * zero the thread's client unread counter.
 *
 * Uses the admin client because the user-scoped client cannot UPDATE
 * staff/bot rows (chat_messages_client WITH CHECK forces author_type='client').
 */
export async function markThreadRead(threadId: string): Promise<void> {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    return;
  }
  const admin = createAdminSupabase();
  const now = new Date().toISOString();

  // Verify the thread belongs to the current client (defence in depth —
  // the action runs server-side so the threadId can't be tampered with
  // mid-flight, but a malicious client could still pass a foreign id).
  const { data: thread } = await admin
    .from("chat_threads")
    .select("id, client_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread || thread.client_id !== portal.clientId) return;

  await admin
    .from("chat_messages")
    .update({ delivered_at: now, read_at: now })
    .eq("thread_id", threadId)
    .in("author_type", ["staff", "bot"])
    .is("read_at", null);

  await admin
    .from("chat_threads")
    .update({ unread_count_client: 0 })
    .eq("id", threadId);
}

/**
 * Returns true if any tenant_member with role in ('owner','admin','staff')
 * has signed in within the last 5 minutes.
 *
 * V1 implementation: queries auth.users via admin.auth.admin.listUsers()
 * and filters to staff member ids. CAVEAT: last_sign_in_at only updates
 * on actual sign-in events, NOT on every dashboard request. So an active
 * staff session that signed in 2 hours ago will report inactive.
 *
 * V2 (Antigravity Prompt 9 — admin dashboard): swap to a heartbeat
 * column on the staff table, ticked by a middleware on every authed
 * /admin request. That gives true "active in last 5 min" behaviour.
 */
export async function isAnyStaffActive(tenantId: string): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data: members } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin", "staff"]);
    const memberIds = new Set(
      ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
    );
    if (memberIds.size === 0) return false;

    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (!list?.users) return false;

    const fiveMinAgoMs = Date.now() - 5 * 60 * 1000;
    for (const u of list.users) {
      if (!memberIds.has(u.id)) continue;
      const t = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
      if (t > fiveMinAgoMs) return true;
    }
    return false;
  } catch (err) {
    console.warn("[chat/isAnyStaffActive] check failed (returning false):", err);
    return false;
  }
}

function deriveFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
