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
 * BottomNav — Revolut-style pill indicator on the active icon.
 * Active state: a sage-tinted pill capsule wraps the icon; label turns sage-deep.
 * Inactive: icon + label in olive/40 (muted).
 * Shop entry is conditional (passed from server layout via `showShop`).
 */
export function BottomNav({ showShop = false }: { showShop?: boolean }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/portal/login")) return null;

  const items: NavItem[] = showShop
    ? [BASE_ITEMS[0], BASE_ITEMS[1], BASE_ITEMS[2], SHOP_ITEM, BASE_ITEMS[3]]
    : BASE_ITEMS;

  return (
    <nav className="ax-glass fixed inset-x-0 bottom-0 z-40 flex h-[86px] items-start justify-around px-1 pt-2">
      {items.map(({ href, label, Icon }) => {
        const active =
          href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-1.5 pt-1"
            aria-current={active ? "page" : undefined}
          >
            {/* Pill / icon container */}
            <span
              className={cn(
                "flex items-center justify-center rounded-2xl transition-all duration-200 ease-ios",
                active
                  ? "h-8 w-14 bg-sage/[0.13]"
                  : "h-8 w-14"
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2 : 1.6}
                className={cn(
                  "transition-colors duration-200",
                  active ? "text-sage-deep" : "text-olive/40"
                )}
              />
            </span>

            {/* Label */}
            <span
              className={cn(
                "text-[10px] font-medium tracking-wide transition-colors duration-200",
                active ? "text-sage-deep" : "text-olive/40"
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
