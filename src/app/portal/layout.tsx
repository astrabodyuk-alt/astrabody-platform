import { Suspense } from "react";
import { BottomNav } from "@/components/portal/BottomNav";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalServiceWorkerRegistry } from "./PortalServiceWorkerRegistry";
import { InstallBanner } from "./InstallBanner";
import { PrefetchPortalRoutes } from "./PrefetchPortalRoutes";
import { SWRProvider } from "./SWRProvider";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { countActiveProductsForTenant } from "@/lib/shop/queries";
import { getCurrentClient } from "@/lib/portal/queries";

/**
 * Portal layout — responsive.
 *
 * Mobile  (<md):  max-w-[480px] centred, PortalTopBar + floating BottomNav.
 * Desktop (≥md):  full-width flex-row — PortalSidebar (200px) + main content.
 *
 * Structural shell streams immediately; data sub-components load in parallel
 * with page content via React Suspense. getCurrentClient() is React.cache'd
 * so sidebar + page share a single DB hit per request.
 */

async function TopBarWithName() {
  try {
    const me = await getCurrentClient();
    return <PortalTopBar clientName={me.firstName} />;
  } catch {
    return <PortalTopBar />;
  }
}

async function SidebarWithName() {
  try {
    const me = await getCurrentClient();
    return <PortalSidebar clientName={me.firstName} />;
  } catch {
    return <PortalSidebar />;
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
    <SWRProvider>
      {/*
        Mobile  : column, centred, max-w-[480px]
        Desktop : flex-row — sidebar (sticky 200px) + flex-1 content
      */}
      <div className="flex min-h-screen w-full bg-cream md:flex-row">

        {/* Desktop sidebar — hidden on mobile */}
        <Suspense fallback={null}>
          <SidebarWithName />
        </Suspense>

        {/* Main column */}
        <div className="relative mx-auto flex w-full max-w-[480px] flex-col md:mx-0 md:max-w-none md:flex-1">

          {/* Top bar — mobile only */}
          <div className="md:hidden">
            <Suspense fallback={<PortalTopBar />}>
              <TopBarWithName />
            </Suspense>
          </div>

          <main className="flex-1 pb-[100px] md:pb-6">{children}</main>

          {/* Bottom nav — mobile only */}
          <div className="md:hidden">
            <Suspense fallback={<BottomNav showShop={false} />}>
              <BottomNavWithData />
            </Suspense>
          </div>
        </div>
      </div>

      <PortalServiceWorkerRegistry />
      <InstallBanner />
      <PrefetchPortalRoutes />
    </SWRProvider>
  );
}
