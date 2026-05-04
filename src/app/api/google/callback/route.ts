import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  newOAuth2Client,
  persistIntegration,
} from "@/lib/google-calendar/oauth";
import { verifyOAuthState } from "@/lib/crypto/tokens";

/**
 * GET /api/google/callback?code=...&state=...&error=...
 *
 * Google redirects here after the consent screen.
 *   1. Verify state HMAC + expiry → resolve staff_id.
 *   2. Exchange code for tokens via OAuth2Client.getToken.
 *   3. Verify the id_token to extract the user's email (audience-checked).
 *   4. Encrypt refresh_token and upsert google_calendar_integrations.
 *   5. Redirect to /admin/calendar?connected=1.
 *
 * On any failure, redirect to /admin/calendar?error=... with a short tag
 * the page can render as a soft toast.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const errParam = url.searchParams.get("error");
  if (errParam) {
    return NextResponse.redirect(
      new URL(`/admin/calendar?error=${encodeURIComponent(errParam)}`, request.url)
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/admin/calendar?error=missing_params", request.url)
    );
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    return NextResponse.redirect(
      new URL("/admin/calendar?error=bad_state", request.url)
    );
  }
  const staffId = verified.staff_id;

  // Belt + braces: the user landing on /callback should still be the
  // signed-in staff member. If not, refuse to bind tokens to a staff row
  // that isn't theirs.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/portal/login", request.url));
  }

  const admin = createAdminSupabase();
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id, user_id, email")
    .eq("id", staffId)
    .maybeSingle();
  if (!staff || staff.user_id !== user.id) {
    return NextResponse.redirect(
      new URL("/admin/calendar?error=staff_mismatch", request.url)
    );
  }

  const oauth = newOAuth2Client();
  type Credentials = import("googleapis").Auth.Credentials;
  let tokens: Credentials;
  try {
    const result = await oauth.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    console.error("[gcal/callback] token exchange failed", err);
    return NextResponse.redirect(
      new URL("/admin/calendar?error=token_exchange", request.url)
    );
  }

  if (!tokens.refresh_token) {
    // We asked for prompt=consent + access_type=offline so this should
    // always be present on first auth. If it's missing, the user likely
    // re-authed without revoking — the refresh_token is only emitted
    // once unless the prior grant was revoked.
    return NextResponse.redirect(
      new URL("/admin/calendar?error=no_refresh_token", request.url)
    );
  }

  // Resolve the user's google email from the id_token (verified).
  let googleEmail: string | null = null;
  if (tokens.id_token) {
    try {
      const ticket = await oauth.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      });
      const payload = ticket.getPayload();
      googleEmail = payload?.email ?? null;
    } catch (err) {
      console.warn("[gcal/callback] id_token verify failed", err);
    }
  }
  // Fall back to staff.email so we always have something to display.
  if (!googleEmail) googleEmail = (staff.email as string | null) ?? "unknown@google";

  try {
    await persistIntegration({
      tenantId: staff.tenant_id as string,
      staffId: staff.id as string,
      googleEmail,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      accessTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(/\s+/) : [],
    });
  } catch (err) {
    console.error("[gcal/callback] persistIntegration failed", err);
    return NextResponse.redirect(
      new URL("/admin/calendar?error=persist_failed", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/admin/calendar?connected=1", request.url)
  );
}
