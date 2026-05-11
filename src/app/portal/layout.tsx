import { Suspense } from "react";
import { BottomNav } from "@/components/portal/BottomNav";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { PortalServiceWorkerRegistry } from "./PortalServiceWorkerRegistry";
import { InstallBanner } from "./InstallBanner";
import { PrefetchPortalRoutes } from "./PrefetchPortalRoutes";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { countActiveProductsForTenant } from "@/lib/shop/queries";
import { getCurrentClient } from "@/lib/portal/queries";

/**
 * Portal layout.
 *
 * Previously all DB calls (getCurrentClient + shop count) were awaited
 * before any HTML was sent. On a Vercel cold start this added ~800ms of
 * blank screen before even the app shell was visible.
 *
 * Now the structural shell (cream background + fallback nav bars) streams
 * immediately. Two async sub-components load the nav data in parallel
 * with the page content via React Suspense. getCurrentClient() is wrapped
 * with React.cache(), so both sub-components share a single DB round-trip.
 */

async function TopBarWithName() {
  try {
    const me = await getCurrentClient();
    return <PortalTopBar clientName={me.firstName} />;
  } catch {
    return <PortalTopBar />;
  }
}

async function BottomNavWithData() {
  try {
    const me = await getCurrentClient();
    const admin = createAdminSupabase();
    const shopCount = await countActiveProductsForTenant(me.tenant_id);
    return <BottomNav showShop={shopCount > 0} />;
  } catch {
    return <BottomNav showShop={false} />;
  }
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-cream">
      {/* TopBar: renders instantly as skeleton (no name), then hydrates with
          the client's first name once the session resolves. */}
      <Suspense fallback={<PortalTopBar />}>
        <TopBarWithName />
      </Suspense>

      <main className="flex-1 pb-[100px]">{children}</main>

      {/* BottomNav: renders instantly (showShop=false fallback), shop badge
          appears once the product count query resolves. */}
      <Suspense fallback={<BottomNav showShop={false} />}>
        <BottomNavWithData />
      </Suspense>

      <PortalServiceWorkerRegistry />
      <InstallBanner />
      {/* Eagerly prefetch all portal tabs in background for instant switching */}
      <PrefetchPortalRoutes />
    </div>
  );
}
