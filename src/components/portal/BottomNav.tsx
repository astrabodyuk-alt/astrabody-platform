"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Calendar,
  MessageCircle,
  ShoppingBag,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof Home;
}

const BASE_ITEMS: NavItem[] = [
  { href: "/portal",       label: "Home",  Icon: Home },
  { href: "/portal/book",  label: "Book",  Icon: Calendar },
  { href: "/portal/chat",  label: "Chat",  Icon: MessageCircle },
  { href: "/portal/me",    label: "You",   Icon: User },
];

const SHOP_ITEM: NavItem = {
  href: "/portal/shop",
  label: "Shop",
  Icon: ShoppingBag,
};

/**
 * BottomNav — glass background, line icons, sage-deep on active.
 * The Shop entry is conditional: it only renders when the tenant has
 * at least one active product (decided server-side, passed via the
 * `showShop` prop from the portal layout).
 */
export function BottomNav({ showShop = false }: { showShop?: boolean }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/portal/login")) return null;

  // Insert Shop between Chat and You so the most-used items keep their
  // muscle-memory positions on mobile.
  const items: NavItem[] = showShop
    ? [BASE_ITEMS[0], BASE_ITEMS[1], BASE_ITEMS[2], SHOP_ITEM, BASE_ITEMS[3]]
    : BASE_ITEMS;

  return (
    <nav className="ax-glass fixed inset-x-0 bottom-0 z-40 flex h-[86px] items-start justify-around px-2 pt-3">
      {items.map(({ href, label, Icon }) => {
        const active =
          href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 text-[10px] font-medium tracking-wide transition-colors duration-200 ease-ios",
              active ? "text-sage-deep" : "text-olive-faint"
            )}
            aria-current={active ? "page" : undefined}
          >
            <span className="flex h-6 w-6 items-center justify-center">
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <span>{label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute -mt-2 h-1 w-1 rounded-full bg-sage-deep"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
