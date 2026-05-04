"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LogOut,
  Gift,
  User,
  Bell,
  ChevronRight,
  Calendar,
  Clock,
  Star,
  MessageCircle,
  ShoppingBag,
  Repeat2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/browser";

interface DrawerSection {
  title: string;
  items: DrawerItem[];
}

interface DrawerItem {
  label: string;
  sublabel?: string;
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  destructive?: boolean;
}

export function PortalTopBar({ clientName }: { clientName?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Hide on login page
  if (pathname?.startsWith("/portal/login")) return null;

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/portal/login");
  }

  const sections: DrawerSection[] = [
    {
      title: "Bookings",
      items: [
        {
          label: "Book a session",
          sublabel: "Check availability",
          href: "/portal/book",
          icon: Calendar,
        },
        {
          label: "Recent sessions",
          sublabel: "Book again",
          href: "/portal/me#sessions",
          icon: Clock,
        },
      ],
    },
    {
      title: "Rewards",
      items: [
        {
          label: "How I earned",
          sublabel: "Points history",
          href: "/portal/me#points",
          icon: Star,
        },
        {
          label: "Spend my points",
          sublabel: "Vouchers & discounts",
          href: "/portal/me#rewards",
          icon: Gift,
        },
        {
          label: "Refer a friend",
          sublabel: "Earn £10 credit each",
          href: "/portal/me#referral",
          icon: Repeat2,
        },
        {
          label: "Shop",
          sublabel: "Nutrition & digital products",
          href: "/portal/shop",
          icon: ShoppingBag,
        },
      ],
    },
    {
      title: "Account",
      items: [
        {
          label: "Chat with us",
          sublabel: "Message the studio",
          href: "/portal/chat",
          icon: MessageCircle,
        },
        {
          label: "My profile",
          sublabel: clientName,
          href: "/portal/me",
          icon: User,
        },
        {
          label: "Notifications",
          href: "/portal/me#notifications",
          icon: Bell,
        },
        {
          label: "Sign out",
          icon: LogOut,
          destructive: true,
          onClick: signOut,
        },
      ],
    },
  ];

  return (
    <>
      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-cream/90 px-5 backdrop-blur-md">
        <Link
          href="/portal"
          className="font-serif text-[20px] font-medium tracking-tight text-olive"
        >
          Astrabody
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-olive transition-colors hover:bg-olive/5 active:bg-olive/10"
        >
          <Menu size={22} strokeWidth={1.6} />
        </button>
      </header>

      {/* ── Backdrop ──────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-olive/30 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* ── Drawer ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-[320px] flex-col bg-cream shadow-2xl transition-transform duration-300 ease-ios",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-5">
          <span className="font-serif text-[17px] font-medium tracking-tight text-olive">
            Menu
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-olive transition-colors hover:bg-olive/5"
          >
            <X size={20} strokeWidth={1.6} />
          </button>
        </div>

        {/* Scrollable section list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, si) => (
            <div key={section.title} className={cn(si > 0 && "mt-5")}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-olive-faint">
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const inner = (
                    <div
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                        item.destructive
                          ? "text-destructive hover:bg-destructive/5"
                          : "text-olive hover:bg-olive/5"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.destructive ? "bg-destructive/8" : "bg-olive/6"
                        )}
                      >
                        <Icon size={15} strokeWidth={1.6} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-[13px] font-medium leading-tight">
                          {item.label}
                        </div>
                        {item.sublabel && (
                          <div className="mt-0.5 text-[11px] text-olive-soft">
                            {item.sublabel}
                          </div>
                        )}
                      </div>
                      {!item.destructive && (
                        <ChevronRight size={14} strokeWidth={1.6} className="text-olive-faint" />
                      )}
                    </div>
                  );

                  if (item.href) {
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="w-full"
                      onClick={() => {
                        setOpen(false);
                        item.onClick?.();
                      }}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-hairline px-5 py-4 text-center text-[10px] tracking-wide text-olive-faint">
          Astrabody · 149 Hursley Road, Chandler's Ford
        </div>
      </aside>
    </>
  );
}
