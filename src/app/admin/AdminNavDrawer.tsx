"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu as MenuIcon,
  X,
  CalendarDays,
  CalendarCheck,
  Inbox,
  Users,
  Sparkles,
  Star,
  ShoppingBag,
  Mail,
  Wallet,
  TrendingUp,
  PiggyBank,
  Settings,
  Home,
  ShoppingCart,
  BarChart3,
  LogOut,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

interface DrawerItem {
  href: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  ownerOrAdminOnly?: boolean;
  ownerOnly?: boolean;
  badgeKinds?: string[];
  /** When true, the badge uses pendingProposalsCount instead of notification kinds. */
  showProposalsBadge?: boolean;
}

interface DrawerSection {
  label: string;
  items: DrawerItem[];
}

const SECTIONS: DrawerSection[] = [
  {
    label: "Today",
    items: [
      { href: "/admin", label: "Today", icon: Home, exact: true },
      {
        href: "/admin/bookings",
        label: "Bookings",
        icon: CalendarCheck,
        badgeKinds: ["noshow_charge_failed", "card_declined"],
      },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
      {
        href: "/admin/inbox",
        label: "Inbox",
        icon: Inbox,
        badgeKinds: ["new_chat_message"],
      },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/admin/clients", label: "Clients", icon: Users },
      { href: "/admin/loyalty", label: "Loyalty", icon: Sparkles },
      {
        href: "/admin/reviews",
        label: "Reviews",
        icon: Star,
        ownerOrAdminOnly: true,
        badgeKinds: ["review_received", "google_review_posted"],
      },
    ],
  },
  {
    label: "Revenue",
    items: [
      { href: "/admin/sales", label: "Sales", icon: ShoppingCart },
      {
        href: "/admin/shop",
        label: "Shop",
        icon: ShoppingBag,
        ownerOrAdminOnly: true,
      },
      {
        href: "/admin/emails",
        label: "Emails",
        icon: Mail,
        ownerOrAdminOnly: true,
        showProposalsBadge: true,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/me", label: "My earnings", icon: Wallet },
      {
        href: "/admin/payroll",
        label: "Payroll",
        icon: PiggyBank,
        ownerOrAdminOnly: true,
        badgeKinds: ["monthly_payroll_ready"],
      },
      {
        href: "/admin/finance",
        label: "Finance",
        icon: TrendingUp,
        ownerOnly: true,
      },
      {
        href: "/admin/analytics",
        label: "Analytics",
        icon: BarChart3,
        ownerOrAdminOnly: true,
      },
    ],
  },
  {
    label: "Manage",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
  },
];

/**
 * Slide-over admin drawer. Replaces the old horizontal AdminNav so the
 * 14 items don't fight for header width. Hamburger on the left of the
 * header opens a 320px sage-cream drawer with grouped sections + a
 * Sign out link at the bottom.
 *
 * Owner / admin gates and per-item notification badges are preserved
 * from the previous nav (Prompt 12).
 */
export function AdminNavDrawer({
  isOwnerOrAdmin,
  isOwner,
  unreadByKind,
  pendingProposalsCount = 0,
}: {
  isOwnerOrAdmin: boolean;
  isOwner: boolean;
  unreadByKind: Record<string, number>;
  pendingProposalsCount?: number;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function badgeFor(item: DrawerItem): number {
    if (item.showProposalsBadge) return pendingProposalsCount;
    if (!item.badgeKinds || item.badgeKinds.length === 0) return 0;
    let total = 0;
    for (const k of item.badgeKinds) total += unreadByKind[k] ?? 0;
    return total;
  }

  function isItemVisible(item: DrawerItem): boolean {
    if (item.ownerOnly && !isOwner) return false;
    if (item.ownerOrAdminOnly && !isOwnerOrAdmin) return false;
    return true;
  }

  function isItemActive(item: DrawerItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    window.location.assign("/portal/login");
  }

  // Total badge count across visible items — surfaces a sage dot on
  // the closed hamburger when there's anything unread inside.
  const totalBadge = SECTIONS.reduce((acc, sec) => {
    return (
      acc +
      sec.items
        .filter(isItemVisible)
        .reduce((a, item) => a + badgeFor(item), 0)
    );
  }, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="admin-drawer"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-hairline-strong bg-white text-sage transition-colors duration-200 ease-ios hover:bg-cream-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50"
      >
        <MenuIcon size={18} strokeWidth={1.6} />
        {totalBadge > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#FF3B30]"
          />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="fixed inset-0 z-40 bg-olive/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[320px] flex-col border-r-[0.5px] border-hairline bg-cream shadow-2"
          >
            <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-hairline px-5 py-4">
              <span className="font-serif text-[18px] font-medium tracking-tight text-olive">
                Astrabody · Staff
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-olive-soft transition-colors duration-200 ease-ios hover:bg-cream-deep hover:text-olive"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>

            <nav
              aria-label="Admin sections"
              className="flex-1 overflow-y-auto px-3 py-4"
            >
              {SECTIONS.map((section, sIdx) => {
                const visible = section.items.filter(isItemVisible);
                if (visible.length === 0) return null;
                return (
                  <div
                    key={section.label}
                    className={cn(
                      "py-2",
                      sIdx > 0 && "border-t-[0.5px] border-hairline mt-2 pt-3"
                    )}
                  >
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-label-caps text-olive-faint">
                      {section.label}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {visible.map((item) => {
                        const Icon = item.icon;
                        const active = isItemActive(item);
                        const badge = badgeFor(item);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "relative flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] font-medium tracking-snug transition-colors duration-150 ease-ios",
                                active
                                  ? "bg-sage-light/40 text-sage-deep"
                                  : "text-olive-soft hover:bg-cream-deep/70 hover:text-olive"
                              )}
                            >
                              <Icon
                                size={16}
                                strokeWidth={1.6}
                                className={cn(
                                  "flex-shrink-0",
                                  active ? "text-sage-deep" : "text-olive-soft"
                                )}
                              />
                              <span className="flex-1 truncate">{item.label}</span>
                              {badge > 0 && (
                                <span
                                  aria-label={`${badge} unread`}
                                  className="ml-auto inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
                                  style={{ background: "#FF3B30" }}
                                >
                                  {badge > 99 ? "99+" : badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>

            <div className="border-t-[0.5px] border-hairline px-3 py-3">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-[14px] font-medium tracking-snug text-olive-soft transition-colors duration-150 ease-ios hover:bg-cream-deep/70 hover:text-olive disabled:opacity-50"
              >
                <LogOut size={16} strokeWidth={1.6} className="flex-shrink-0" />
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
