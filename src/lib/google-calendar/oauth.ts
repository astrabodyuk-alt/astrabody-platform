import "server-only";
import { google, type Auth } from "googleapis";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/crypto/tokens";

/**
 * Build a fresh OAuth2Client (no credentials yet). Used by the connect
 * route before we have a refresh token, and by the staff-scoped helper
 * below to pre-load credentials per-staff.
 */
export function newOAuth2Client(): Auth.OAuth2Client {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error(
      "Google OAuth env vars missing (GOOGLE_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI)"
    );
  }
  return new google.auth.OAuth2(id, secret, redirect);
}

/**
 * Returns an OAuth2Client preloaded with credentials for the given staff,
 * with a fresh access_token (auto-refreshed if < 5 min remaining).
 *
 * Returns null if the staff has no active integration. The caller treats
 * null as "no calendar — degrade gracefully": availability returns no
 * busy intervals, events.insert is skipped.
 */
export async function getOAuth2ClientForStaff(
  staffId: string
): Promise<{ client: Auth.OAuth2Client; calendarId: string } | null> {
  const admin = createAdminSupabase();
  const { data: integration } = await admin
    .from("google_calendar_integrations")
    .select(
      "staff_id, calendar_id, refresh_token_enc, access_token, access_token_expires_at, is_active"
    )
    .eq("staff_id", staffId)
    .eq("is_active", true)
    .maybeSingle();
  if (!integration) return null;

  const calendarId = (integration.calendar_id as string) ?? "primary";
  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(integration.refresh_token_enc as string);
  } catch (err) {
    console.error(
      "[gcal/oauth] failed to decrypt refresh_token for staff",
      staffId,
      err
    );
    return null;
  }

  const client = newOAuth2Client();
  const expiryMs = integration.access_token_expires_at
    ? Date.parse(integration.access_token_expires_at as string)
    : 0;
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: (integration.access_token as string | null) ?? undefined,
    expiry_date: expiryMs || undefined,
  });

  const needsRefresh = !integration.access_token || expiryMs - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    try {
      // getAccessToken triggers a refresh when expiry_date is past or absent
      // and the OAuth2Client has a refresh_token. The credentials object
      // is mutated in place.
      await client.getAccessToken();
      const creds = client.credentials;
      await admin
        .from("google_calendar_integrations")
        .update({
          access_token: creds.access_token ?? null,
          access_token_expires_at: creds.expiry_date
            ? new Date(creds.expiry_date).toISOString()
            : null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("staff_id", staffId);
    } catch (err) {
      console.error("[gcal/oauth] refresh failed for staff", staffId, err);
      return null;
    }
  }

  return { client, calendarId };
}

/**
 * Persist a freshly-issued token bundle on completion of the OAuth dance.
 * Encrypts the refresh_token before writing.
 */
export async function persistIntegration(args: {
  tenantId: string;
  staffId: string;
  googleEmail: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
}): Promise<void> {
  const admin = createAdminSupabase();
  const refresh_token_enc = encryptRefreshToken(args.refreshToken);
  const { error } = await admin
    .from("google_calendar_integrations")
    .upsert(
      {
        tenant_id: args.tenantId,
        staff_id: args.staffId,
        google_email: args.googleEmail,
        calendar_id: "primary",
        refresh_token_enc,
        access_token: args.accessToken,
        access_token_expires_at: args.accessTokenExpiresAt?.toISOString() ?? null,
        scopes: args.scopes,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "staff_id" }
    );
  if (error) {
    console.error("[gcal/oauth] persistIntegration failed", error);
    throw new Error("couldn't persist GCal integration");
  }
}
