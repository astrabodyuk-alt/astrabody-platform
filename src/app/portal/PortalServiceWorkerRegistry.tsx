"use client";

import { useEffect } from "react";
import { ensurePushSubscription } from "@/lib/web-push/client";

/**
 * Registers the service worker on /portal mount and re-syncs the push
 * subscription if the user has already granted permission. Mounts once
 * inside the portal layout. Returns nothing visible.
 *
 * Failure is silent in dev console — never blocks rendering.
 */
export function PortalServiceWorkerRegistry() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        if (cancelled) return;
        console.info("[pwa] service worker registered, scope:", reg.scope);

        // Check for a waiting SW and activate it immediately so new
        // cache versions kick in without requiring a tab close.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const newSw = reg.installing;
          if (!newSw) return;
          newSw.addEventListener("statechange", () => {
            if (newSw.state === "installed" && navigator.serviceWorker.controller) {
              newSw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // If permission was already granted in a prior visit but the
        // subscription has been cleared (private mode, "Clear data",
        // browser sync wipe), re-register it.
        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          await ensurePushSubscription({ promptIfDefault: false }).catch(
            (err) => console.warn("[pwa] re-subscribe failed:", err)
          );
        }
      })
      .catch((err) => {
        console.error("[pwa] service worker registration failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
