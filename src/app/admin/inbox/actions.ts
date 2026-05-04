"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";

export interface SendStaffResult {
  ok: true;
  messageId: string;
}

export type SendResult = SendStaffResult | { ok: false; error: string };

/**
 * Insert a staff-authored message into a thread. Uses user-scoped client
 * because the chat_messages_staff RLS policy lets tenant_members write.
 *
 * Marks the thread's unread_count_client from the trigger naturally; we
 * also push a Web Push to the client's active subscriptions.
 */
export async function sendStaffMessage(input: {
  threadId: string;
  body: string;
}): Promise<SendResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.staffId) return { ok: false, error: "no linked staff record" };

  const trimmed = input.body.trim();
  if (!trimmed) return { ok: false, error: "empty message" };
  if (trimmed.length > 4000) return { ok: false, error: "message too long" };

  const supabase = await createServerSupabase();
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("client_id, tenant_id")
    .eq("id", input.threadId)
    .maybeSingle();
  if (!thread || thread.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "thread not in your tenant" };
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      tenant_id: ctx.tenantId,
      thread_id: input.threadId,
      sender_client_id: null,
      sender_staff_id: ctx.staffId,
      author_type: "staff",
      body: trimmed,
      primary_channel: "in_app_push",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  // Best-effort push.
  try {
    const { sendWebPushToClient } = await import("@/lib/comms/sendWebPushToClient");
    await sendWebPushToClient(thread.client_id as string, {
      title: "Astrabody",
      body: shorten(trimmed, 80),
      url: "/portal/chat",
      tag: `chat-${input.threadId}`,
    });
  } catch (err) {
    console.warn("[inbox/sendStaffMessage] push send skipped:", err);
  }

  revalidatePath("/admin/inbox");
  return { ok: true, messageId: data.id as string };
}

/**
 * Mark every client/bot message in this thread as read by staff and
 * zero the thread's staff unread counter. Uses admin client because
 * chat_messages_staff WITH CHECK on UPDATE forces tenant scoping but
 * doesn't allow updates that change author_type — and we need to
 * mark client-authored rows.
 *
 * (Same pattern as /portal/chat's markThreadRead.)
 */
export async function markThreadReadByStaff(threadId: string): Promise<void> {
  const ctx = await getAdminContext();
  if (!ctx) return;
  const admin = createAdminSupabase();
  const { data: thread } = await admin
    .from("chat_threads")
    .select("id, tenant_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread || thread.tenant_id !== ctx.tenantId) return;

  const now = new Date().toISOString();
  await admin
    .from("chat_messages")
    .update({ delivered_at: now, read_at: now })
    .eq("thread_id", threadId)
    .eq("author_type", "client")
    .is("read_at", null);

  await admin
    .from("chat_threads")
    .update({ unread_count_staff: 0 })
    .eq("id", threadId);
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
