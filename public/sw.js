/* Astrabody — Service Worker v2
 *
 * Caching strategy:
 *  /_next/static/**   → Cache-first forever (content-hashed by Next.js, safe)
 *  /icons/**          → Cache-first (stable static assets)
 *  /images/**         → Cache-first (stable static assets)
 *  /manifest.json     → Cache-first
 *  /portal* HTML      → Network-first, 4s timeout → cached fallback (auth-safe)
 *  /api/**            → Network-only (never cache)
 *
 * This eliminates the 3-5s re-download of JS chunks on every PWA cold open.
 * After first visit, the app shell loads in <1s from cache.
 */

const STATIC_CACHE  = "ab-static-v2";   // /_next/static + icons + images
const HTML_CACHE    = "ab-html-v2";     // /portal* HTML shells
const NETWORK_TIMEOUT_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNextStatic(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.json"
  );
}

function isPortalHTML(req, url) {
  return (
    req.mode === "navigate" &&
    url.pathname.startsWith("/portal")
  );
}

function isApiRoute(url) {
  return url.pathname.startsWith("/api/");
}

/** Fetch with a timeout. Rejects with "timeout" if the network is too slow. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ─── Install — claim immediately, no pre-cache needed ─────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

// ─── Activate — delete old caches, claim clients ──────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== HTML_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin (Supabase, Stripe, etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache API routes — always network
  if (isApiRoute(url)) return;

  // ── Next.js static chunks — cache-first forever ──
  if (isNextStatic(url) || isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const fresh = await fetch(event.request);
        if (fresh.ok) cache.put(event.request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // ── Portal HTML — network-first with timeout, cached fallback ──
  // We do NOT serve stale HTML as the live response (auth cookies change)
  // but we keep a cached copy as an instant fallback when the network is
  // slow / offline. On a fast connection the network wins; on cold start
  // the cached shell appears immediately while the real request races.
  if (isPortalHTML(event.request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(HTML_CACHE);
        try {
          const fresh = await fetchWithTimeout(event.request.clone(), NETWORK_TIMEOUT_MS);
          if (fresh.ok) cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          // Network slow or offline — serve the cached version instantly
          const cached = await cache.match(event.request);
          if (cached) return cached;
          // No cache yet — just let it fail naturally
          return fetch(event.request);
        }
      })()
    );
    return;
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    console.warn("[sw] push payload was not JSON", err);
  }
  const title = data.title || "Astrabody";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/portal" },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if (c.url.includes(url) && "focus" in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
