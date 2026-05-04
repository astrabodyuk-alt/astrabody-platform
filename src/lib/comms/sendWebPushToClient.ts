import "server-only";
import webpush from "web-push";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Real Web Push send (Prompt 7 wired). Loops over the client's active
 * subscriptions and ships a payload to each via web-push.
 *
 * On 410 Gone or 404 from a subscription endpoint we deactivate the
 * row (the browser has revoked it and it'll never deliver again). On
 * any other error we bump failure_count; a future cleanup cron can
 * deactivate after N consecutive failures.
 *
 * Returns:
 *   - delivered: true if at least one subscription accepted
 *   - channel:   "in_app_push" if delivered, null otherwise
 *   - attempted: count of subscriptions we tried (caller decides whether
 *                to fall back to WhatsApp / email when this is 0)
 */

let _vapidConfigured = false;
function configureVapid(): boolean {
  if (_vapidConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:enquiries@astrabody.co.uk";
  if (!pub || !priv) {
    console.warn(
      "[webpush] VAPID keys not set — sends will no-op. Run `npx web-push generate-vapid-keys --json` and paste into .env.local."
    );
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  _vapidConfigured = true;
  return true;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface WebPushResult {
  delivered: boolean;
  channel: "in_app_push" | null;
  attempted: number;
}

export async function sendWebPushToClient(
  clientId: string,
  payload: WebPushPayload
): Promise<WebPushResult> {
  const admin = createAdminSupabase();
  const { data: subs } = await admin
    .from("client_push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key, failure_count")
    .eq("client_id", clientId)
    .eq("is_active", true);

  const list = (subs ?? []) as Array<{
    id: string;
    endpoint: string;
    p256dh_key: string;
    auth_key: string;
    failure_count: number;
  }>;

  if (list.length === 0) {
    return { delivered: false, channel: null, attempted: 0 };
  }
  if (!configureVapid()) {
    return { delivered: false, channel: null, attempted: list.length };
  }

  const json = JSON.stringify(payload);
  let successes = 0;

  await Promise.all(
    list.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh_key, auth: s.auth_key },
          },
          json
        );
        successes++;
        await admin
          .from("client_push_subscriptions")
          .update({
            last_seen_at: new Date().toISOString(),
            failure_count: 0,
          })
          .eq("id", s.id);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await admin
            .from("client_push_subscriptions")
            .update({ is_active: false, failure_count: s.failure_count + 1 })
            .eq("id", s.id);
        } else {
          await admin
            .from("client_push_subscriptions")
            .update({ failure_count: s.failure_count + 1 })
            .eq("id", s.id);
          console.warn("[webpush] send failed:", status, err);
        }
      }
    })
  );

  return {
    delivered: successes > 0,
    channel: successes > 0 ? "in_app_push" : null,
    attempted: list.length,
  };
}
