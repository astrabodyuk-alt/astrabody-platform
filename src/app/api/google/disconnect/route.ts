import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decryptRefreshToken } from "@/lib/crypto/tokens";

/**
 * POST or GET /api/google/disconnect
 *
 * Revokes the staff member's refresh_token at Google, then flips the
 * integration row's `is_active` to false (kept for audit).
 *
 * Caller must be the linked staff. We do NOT delete the row so we can
 * see "connected, then disconnected on X" in admin reports later.
 */
async function handler(request: NextRequest): Promise<Response> {
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
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  const { data: integration } = await admin
    .from("google_calendar_integrations")
    .select("id, refresh_token_enc, is_active")
    .eq("staff_id", staff.id as string)
    .eq("is_active", true)
    .maybeSingle();

  if (integration) {
    try {
      const refreshToken = decryptRefreshToken(integration.refresh_token_enc as string);
      const oauth = new google.auth.OAuth2();
      // OAuth2Client.revokeToken hits oauth2.googleapis.com/revoke under the hood.
      await oauth.revokeToken(refreshToken).catch((err) => {
        console.warn(
          "[gcal/disconnect] revoke at Google failed (continuing):",
          (err as Error).message
        );
      });
    } catch (err) {
      console.warn(
        "[gcal/disconnect] couldn't decrypt to revoke (continuing):",
        (err as Error).message
      );
    }

    await admin
      .from("google_calendar_integrations")
      .update({ is_active: false })
      .eq("id", integration.id as string);
  }

  return NextResponse.redirect(
    new URL("/admin/calendar?disconnected=1", request.url)
  );
}

export const GET = handler;
export const POST = handler;
