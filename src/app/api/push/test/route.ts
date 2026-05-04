import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendWebPushToClient } from "@/lib/comms/sendWebPushToClient";

/**
 * GET /api/push/test
 *
 * Dev-convenience endpoint. Fires a test notification to the current
 * client's active subscriptions. Useful for end-to-end verification
 * after enabling notifications in /portal/me settings.
 *
 * Returns the delivery result JSON.
 */
export async function GET(): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const { data: link } = await supabase
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: "no portal link" }, { status: 403 });
  }

  const result = await sendWebPushToClient(link.client_id as string, {
    title: "Astrabody test",
    body: "If you see this, push is wired.",
    url: "/portal",
    tag: "test",
  });
  return NextResponse.json(result);
}
