/* Astrabody — Service Worker v3
 *
 * Caching strategy:
 *  /_next/static/**   → Cache-first forever (content-hashed by Next.js, safe)
 *  /icons/**          → Cache-first (stable static assets)
 *  /images/**         → Cache-first (stable static assets)
 *  /manifest.json     → Cache-first
 *  /portal* HTML      → Stale-while-revalidate: serve cache instantly,
 *                        fetch fresh in background, skip cache on redirects
 *                        (auth-safe: React hydration corrects stale state)
 *  /api/**            → Network-only (never cache)
 *
 * v3 change: portal HTML switched from "network-first 4s" to
 * "stale-while-revalidate" — eliminates the blank-screen wait on every
 * PWA open. After first visit the app appears in <200ms from cache.
 */

const STATIC_CACHE  = "ab-static-v3";   // /_next/static + icons + images
const HTML_CACHE    = "ab-html-v3";     // /portal* HTML shells

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

  // ── Portal HTML — stale-while-revalidate ──────────────────────────────────
  // Serve the cached shell INSTANTLY so the app appears in <200ms, then
  // fetch a fresh copy in the background and update the cache.
  //
  // Auth safety: if the server responds with a redirect (302 to /login),
  // we skip caching and let the browser follow the redirect naturally on
  // the NEXT navigation. React hydration corrects any stale UI in the
  // meantime (data is fetched client-side anyway via server actions).
  if (isPortalHTML(event.request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(HTML_CACHE);
        const cached = await cache.match(event.request);

        // Fire background revalidation regardless of cache hit
        const revalidate = fetch(event.request.clone())
          .then((fresh) => {
            // Only cache successful, non-redirect responses
            if (fresh.ok && fresh.status < 300) {
              cache.put(event.request, fresh.clone());
            }
            return fresh;
          })
          .catch(() => null);

        // Return cached instantly if available, otherwise wait for network
        if (cached) return cached;
        return (await revalidate) ?? fetch(event.request);
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
