"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Eagerly prefetches all bottom-nav portal routes on mount.
 *
 * Next.js <Link> only prefetches when links enter the viewport.
 * This component fires router.prefetch() immediately so the RSC payloads
 * for every main tab are downloaded in the background while the user is
 * reading the current page — making tab switches feel instant.
 *
 * Rendered once inside the portal layout (server component),
 * so prefetch fires on every portal page load.
 */

const PORTAL_ROUTES = [
  "/portal",
  "/portal/book",
  "/portal/chat",
  "/portal/shop",
  "/portal/me",
];

export function PrefetchPortalRoutes() {
  const router = useRouter();

  useEffect(() => {
    // Stagger prefetches slightly so they don't all race at once
    PORTAL_ROUTES.forEach((route, i) => {
      const timer = setTimeout(() => router.prefetch(route), i * 150);
      return () => clearTimeout(timer);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
