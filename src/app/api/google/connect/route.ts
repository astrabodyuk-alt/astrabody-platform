import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { newOAuth2Client } from "@/lib/google-calendar/oauth";
import { signOAuthState } from "@/lib/crypto/tokens";

/**
 * GET /api/google/connect
 *
 * Staff-only entry point to the OAuth flow.
 *   1. Verify the caller is a tenant_member (owner/admin/staff) AND has a
 *      linked staff row (staff.user_id = auth.uid()).
 *   2. Build the Google authorise URL with offline access + consent.
 *   3. Sign a short-lived state token { staff_id, nonce, expires_at }.
 *   4. 302 redirect.
 */
export async function GET(_req: NextRequest): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/portal/login", _req.url));
  }

  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "staff"])
    .maybeSingle();
  if (!member) {
    return NextResponse.redirect(new URL("/portal", _req.url));
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", member.tenant_id as string)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) {
    return NextResponse.redirect(
      new URL("/admin/calendar?error=no_staff_record", _req.url)
    );
  }

  const oauth = newOAuth2Client();
  const state = signOAuthState({
    staff_id: staff.id as string,
    nonce: randomBytes(16).toString("hex"),
    expires_at: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const url = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar",
    ],
    state,
    include_granted_scopes: true,
  });

  return NextResponse.redirect(url);
}
