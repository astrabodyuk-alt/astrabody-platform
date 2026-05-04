"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Mark a single notification as read. RLS gates by recipient_user_id =
 * auth.uid() so the user can only flip her own.
 */
export async function markNotificationRead(id: string): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Mark every unread notification for the current user as read.
 * Used by the "Mark all as read" link in the dropdown.
 */
export async function markAllNotificationsRead(): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "no session" };
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
