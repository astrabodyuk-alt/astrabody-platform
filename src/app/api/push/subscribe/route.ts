import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/push/subscribe
 *
 * Body: a `PushSubscription.toJSON()` payload —
 *   { endpoint, keys: { p256dh, auth }, expirationTime?: number | null }
 *
 * Stores it in public.client_push_subscriptions, upserting on
 * (client_id, endpoint). Admin client used for the upsert because the
 * push_self RLS policy lets clients write their own rows; admin keeps
 * the path simple and consistent with the rest of the portal-mutation
 * actions.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const sub = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    expirationTime?: number | null;
  };
  if (
    !sub.endpoint ||
    !sub.keys?.p256dh ||
    !sub.keys?.auth
  ) {
    return NextResponse.json(
      { error: "missing endpoint or keys" },
      { status: 400 }
    );
  }

  const { data: link } = await supabase
    .from("client_portal_links")
    .select("client_id, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: "no portal link" }, { status: 403 });
  }

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("client_push_subscriptions")
    .upsert(
      {
        tenant_id: link.tenant_id as string,
        client_id: link.client_id as string,
        endpoint: sub.endpoint,
        p256dh_key: sub.keys.p256dh,
        auth_key: sub.keys.auth,
        user_agent: request.headers.get("user-agent") ?? null,
        is_active: true,
        failure_count: 0,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "client_id,endpoint" }
    );
  if (error) {
    console.error("[push/subscribe] upsert failed", error);
    return NextResponse.json({ error: "upsert failed" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
