"use client";

/**
 * Browser-side helpers for the Web Push subscription flow.
 *
 * - `urlBase64ToUint8Array` converts the VAPID public key from URL-safe
 *   base64 to the Uint8Array the PushManager API expects.
 * - `ensurePushSubscription` is the one-call helper used by the
 *   /portal/me Notifications row + the SW registry. It:
 *     1. Asks for permission if `default`.
 *     2. Reads the existing subscription or creates a new one.
 *     3. POSTs the subscription JSON to /api/push/subscribe.
 *
 *   Idempotent and re-runnable — safe to call on every page load when
 *   permission is `granted`.
 */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export type EnsureResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: "no-sw" | "no-notif-api" | "denied" | "default-skipped" | "no-vapid" | "subscribe-failed"; message?: string };

export async function ensurePushSubscription(opts: {
  promptIfDefault?: boolean;
} = {}): Promise<EnsureResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "no-sw" };
  }
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "no-sw" };
  }
  if (!("Notification" in window)) {
    return { ok: false, reason: "no-notif-api" };
  }
  if (Notification.permission === "denied") {
    return { ok: false, reason: "denied" };
  }
  if (Notification.permission === "default") {
    if (!opts.promptIfDefault) {
      return { ok: false, reason: "default-skipped" };
    }
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      return { ok: false, reason: result === "denied" ? "denied" : "default-skipped" };
    }
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "no-vapid" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const alreadySubscribed = !!sub;
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: TS's Uint8Array<ArrayBufferLike> isn't quite the
        // BufferSource the PushManager type wants, but the runtime
        // accepts any TypedArray.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    } catch (err) {
      return { ok: false, reason: "subscribe-failed", message: (err as Error).message };
    }
  }

  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      return { ok: false, reason: "subscribe-failed", message: `http ${res.status}` };
    }
  } catch (err) {
    return { ok: false, reason: "subscribe-failed", message: (err as Error).message };
  }

  return { ok: true, alreadySubscribed };
}
