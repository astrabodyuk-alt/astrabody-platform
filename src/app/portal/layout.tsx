import { BottomNav } from "@/components/portal/BottomNav";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { AssistantBubble } from "@/components/portal/AssistantBubble";
import { PortalServiceWorkerRegistry } from "./PortalServiceWorkerRegistry";
import { InstallBanner } from "./InstallBanner";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { countActiveProductsForTenant } from "@/lib/shop/queries";
import { getCurrentClient } from "@/lib/portal/queries";

/**
 * Portal shell — wraps every /portal/* route. Mobile-first PWA layout.
 *
 * getCurrentClient() is React.cache-wrapped, so calling it here AND in
 * the page does not trigger duplicate auth / DB round-trips.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let showShop = false;
  let isAuthed = false;
  let hasUnreadInbox = false;
  let clientFirstName: string | undefined;

  try {
    const me = await getCurrentClient();
    isAuthed = true;
    clientFirstName = me.firstName;

    // Run shop-count and unread-threads in parallel — neither depends on the other.
    const admin = createAdminSupabase();
    const [shopCount, threadsResult] = await Promise.all([
      countActiveProductsForTenant(me.tenant_id),
      admin
        .from("chat_threads")
        .select("unread_count_client")
        .eq("client_id", me.id),
    ]);

    showShop = shopCount > 0;
    hasUnreadInbox = (
      (threadsResult.data ?? []) as Array<{ unread_count_client: number }>
    ).some((t) => (t.unread_count_client ?? 0) > 0);
  } catch {
    // Not authenticated or DB error — render the shell without auth-gated UI.
    showShop = false;
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-cream">
      <PortalTopBar clientName={clientFirstName} />
      <main className="flex-1 pb-[100px]">{children}</main>
      <BottomNav showShop={showShop} />
      {isAuthed && <AssistantBubble hasUnread={hasUnreadInbox} />}
      <PortalServiceWorkerRegistry />
      <InstallBanner />
    </div>
  );
}
