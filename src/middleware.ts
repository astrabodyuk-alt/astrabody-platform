import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Two jobs per request that the matcher selects:
 *
 *   1. Refresh the Supabase session cookie (single getUser() call).
 *      Without this, server components would see stale auth state once
 *      the access token expires (every hour).
 *
 *   2. Resolve the current host into a tenant slug + custom domain
 *      hint and stash both in headers (`x-tenant-host-slug`,
 *      `x-tenant-custom-domain`). The brand resolver in
 *      `src/lib/tenant/brand.ts` reads them from the request headers
 *      and does the DB lookup once per render.
 *
 * Host resolution rules:
 *   - <slug>.atavoplatform.com     → x-tenant-host-slug = <slug>
 *   - <slug>.localhost:<port>      → x-tenant-host-slug = <slug>
 *   - any other host               → x-tenant-custom-domain = host
 *                                    (the brand resolver checks the
 *                                    custom_domain column first; if no
 *                                    match, it falls back to
 *                                    NEXT_PUBLIC_DEFAULT_TENANT_SLUG)
 *
 * Skipped paths: Next assets, the manifest, the service worker, and
 * /api/_health (no auth or tenant resolution needed there).
 */
export async function middleware(request: NextRequest) {
  // Build a request that already carries our tenant headers, so any
  // server component / action / API route reading via `headers()` sees
  // them — both for the rendered response and for the cookie refresh
  // pass below.
  const tenantHeaders = resolveTenantHeaders(request);
  const requestHeaders = new Headers(request.headers);
  for (const [k, v] of Object.entries(tenantHeaders)) {
    if (v) requestHeaders.set(k, v);
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Capture ?ref=<code> from /portal/book and stash it in a 7-day
  // session cookie. The booking action reads it on the first booking
  // and credits both sides. Pure middleware — server components can't
  // mutate cookies during render.
  const refParam = request.nextUrl.searchParams.get("ref");
  if (refParam && /^[A-Z0-9]{4,16}$/i.test(refParam)) {
    response.cookies.set("astra_ref", refParam.toUpperCase(), {
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

function resolveTenantHeaders(
  request: NextRequest
): { "x-tenant-host-slug"?: string; "x-tenant-custom-domain"?: string } {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host) return {};

  // Strip port. "astrabody.localhost:3000" → "astrabody.localhost".
  const hostNoPort = host.split(":")[0];

  // Subdomain pattern: <slug>.atavoplatform.com OR <slug>.localhost
  const subdomainMatch = hostNoPort.match(
    /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.(atavoplatform\.com|localhost)$/
  );
  if (subdomainMatch) {
    const slug = subdomainMatch[1];
    // "www" / "app" / "api" aren't tenants — they're platform aliases.
    // Skip them and fall through to default-tenant resolution.
    if (slug !== "www" && slug !== "app" && slug !== "api") {
      return { "x-tenant-host-slug": slug };
    }
  }

  // Bare-host or unrecognised pattern. Treat any non-localhost as a
  // potential custom domain (the resolver will look it up). Localhost /
  // root atavoplatform.com fall through to NEXT_PUBLIC_DEFAULT_TENANT_SLUG.
  if (
    hostNoPort !== "localhost" &&
    hostNoPort !== "atavoplatform.com" &&
    hostNoPort !== "www.atavoplatform.com"
  ) {
    return { "x-tenant-custom-domain": hostNoPort };
  }
  return {};
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|api/_health).*)",
  ],
};
