import Image from "next/image";
import Link from "next/link";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import {
  getRecentNotifications,
  getUnreadCountsByKind,
} from "@/lib/notifications/queries";
import { getCurrentTenantBrand } from "@/lib/tenant/brand";
import { getPendingProposalsCount } from "@/lib/comms/queries";
import { AdminNavDrawer } from "./AdminNavDrawer";
import { NotificationsBell } from "./NotificationsBell";

/**
 * /admin/* shell. Auth-gated (redirects non-staff to /portal).
 *
 * Header layout (left → right):
 *   [hamburger]  Astrabody · Staff      [bell] [name (≥sm)] [role pill]
 *
 * The hamburger opens a slide-over drawer with grouped sections (Today
 * / Clients / Revenue / Finance / Manage). The old horizontal nav is
 * gone — too many items, too narrow on mid-width laptops.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContextOrRedirect();

  // Fetch notifications + per-kind unread counts once at the layout
  // level so the bell + drawer badges share data without two round-
  // trips per page render.
  const [recentNotifications, unreadByKind, brand, pendingProposalsCount] =
    await Promise.all([
      getRecentNotifications().catch(() => []),
      getUnreadCountsByKind().catch(() => ({})),
      getCurrentTenantBrand(),
      getPendingProposalsCount(ctx.tenantId).catch(() => 0),
    ]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 border-b-[0.5px] border-hairline bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <AdminNavDrawer
              isOwnerOrAdmin={ctx.isOwnerOrAdmin}
              isOwner={ctx.role === "owner"}
              unreadByKind={unreadByKind}
              pendingProposalsCount={pendingProposalsCount}
            />
            <Link
              href="/admin"
              className="flex items-center gap-2 font-serif text-[18px] font-medium tracking-tight text-olive"
            >
              {brand.logoUrl ? (
                <Image
                  src={brand.logoUrl}
                  alt={brand.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-md object-contain"
                />
              ) : null}
              <span>{brand.name} &middot; Staff</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initial={recentNotifications} />
            <span className="hidden text-[12px] tracking-snug text-olive-soft sm:block">
              {ctx.staffName ?? ctx.email ?? ctx.role}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-label-caps"
              style={{
                background: "rgba(117,133,100,0.10)",
                color: "#5C6B4E",
              }}
            >
              {ctx.role}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-8">{children}</main>
    </div>
  );
}
