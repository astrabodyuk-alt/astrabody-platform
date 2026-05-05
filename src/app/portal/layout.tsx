import { BottomNav } from "@/components/portal/BottomNav";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { PortalServiceWorkerRegistry } from "./PortalServiceWorkerRegistry";
import { InstallBanner } from "./InstallBanner";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { countActiveProductsForTenant } from "@/lib/shop/queries";
import { getCurrentClient } from "@/lib/portal/queries";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let showShop = false;
  let clientFirstName: string | undefined;

  try {
    const me = await getCurrentClient();
    clientFirstName = me.firstName;
    const admin = createAdminSupabase();
    const [shopCount] = await Promise.all([
      countActiveProductsForTenant(me.tenant_id),
      admin.from("chat_threads").select("unread_count_client").eq("client_id", me.id),
    ]);
    showShop = shopCount > 0;
  } catch {
    showShop = false;
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-cream">
      <PortalTopBar clientName={clientFirstName} />
      <main className="flex-1 pb-[100px]">{children}</main>
      <BottomNav showShop={showShop} />
      <PortalServiceWorkerRegistry />
      <InstallBanner />
    </div>
  );
}
