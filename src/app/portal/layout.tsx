import { BottomNav } from "@/components/portal/BottomNav";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { AssistantBubble } from "@/components/portal/AssistantBubble";
import { PortalServiceWorkerRegistry } from "./PortalServiceWorkerRegistry";
import { InstallBanner } from "./InstallBanner";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { countActiveProductsForTenant } from "@/lib/shop/queries";

/**
 * Portal shell — wraps every /portal/* route. Mobile-first PWA layout.
 *
 * Structure:
 *   - PortalTopBar: sticky top header with Astrabody wordmark + hamburger
 *   - main: page content, padded below the bottom nav
 *   - BottomNav: glass bottom navigation (Home / Book / Chat / Shop / You)
 *   - AssistantBubble: floating AI assistant (authed only)
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
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      isAuthed = true;
      const admin = createAdminSupabase();
      const { data: link } = await admin
        .from("client_portal_links")
        .select("client_id, clients (tenant_id, first_name)")
        .eq("user_id", user.id)
        .maybeSingle();
      type Embed =
        | { tenant_id: string; first_name: string | null }
        | { tenant_id: string; first_name: string | null }[]
        | null;
      const e = (link?.clients ?? null) as Embed;
      const clientData = Array.isArray(e) ? e[0] : e;
      const tenantId = clientData?.tenant_id;
      const clientId = link?.client_id as string | undefined;
      clientFirstName = clientData?.first_name ?? undefined;

      if (tenantId) {
        const count = await countActiveProductsForTenant(tenantId);
        showShop = count > 0;
      }
      if (clientId) {
        // Cheap unread chat probe — drives the red dot on the bubble.
        const { data: threads } = await admin
          .from("chat_threads")
          .select("unread_count_client")
          .eq("client_id", clientId);
        hasUnreadInbox = (
          (threads ?? []) as Array<{ unread_count_client: number }>
        ).some((t) => (t.unread_count_client ?? 0) > 0);
      }
    }
  } catch {
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
