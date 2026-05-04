import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * GET /api/cron/comms-proposals-expiry
 *
 * Bearer-auth-protected. Auto-dismisses comms proposals that have been
 * sitting in 'pending' for more than 7 days. The owner can still see
 * the row in /admin/emails (status=dismissed) but it stops badging the
 * nav.
 *
 * TODO: post-deploy, add to vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/comms-proposals-expiry", "schedule": "0 9 * * *" }
 *   ]
 * }
 * Daily at 09:00 UTC.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("comms_proposals")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dismissed: data?.length ?? 0 });
}
