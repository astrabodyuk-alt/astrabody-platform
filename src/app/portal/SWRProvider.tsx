"use client";

import { SWRConfig } from "swr";

/**
 * Global SWR config for the portal.
 *
 * keepPreviousData: true  → shows cached data INSTANTLY on re-navigation
 * revalidateOnFocus: false → doesn't re-fetch every time user switches apps
 * dedupingInterval: 60_000 → deduplicates identical requests within 60s
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        keepPreviousData: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60_000,
        shouldRetryOnError: false,
        fetcher: (url: string) =>
          fetch(url).then((r) => {
            if (r.status === 401) {
              window.location.href = "/portal/login";
              return null;
            }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
      }}
    >
      {children}
    </SWRConfig>
  );
}
