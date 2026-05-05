"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Home,
  Calendar,
  MessageCircle,
  ShoppingBag,
  User,
} from "lucide-react";

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
 * BottomNav — LumaBar-style floating pill.
 * Uses framer-motion layoutId so the active pill capsule + glow slide
 * smoothly between tabs. Floating above the bottom (bottom-5) so it
 * doesn't fill the full width — premium / app-like feel.
 */
export function BottomNav({ showShop = false }: { showShop?: boolean }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/portal/login")) return null;

  const items: NavItem[] = showShop
    ? [BASE_ITEMS[0], BASE_ITEMS[1], BASE_ITEMS[2], SHOP_ITEM, BASE_ITEMS[3]]
    : BASE_ITEMS;

  return (
    /* Outer wrapper — centres the pill, keeps pointer-events off the gap */
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center">
      <nav className="pointer-events-auto relative flex items-center gap-1 rounded-full border border-white/60 bg-white/80 px-3 py-2 shadow-xl shadow-olive/10 backdrop-blur-2xl">
        {items.map(({ href, label, Icon }) => {
          const active =
            href === "/portal"
              ? pathname === "/portal"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="group relative"
            >
              {/* Sliding pill background */}
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-sage/[0.12]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}

              {/* Sage glow under active icon */}
              {active && (
                <motion.span
                  layoutId="nav-glow"
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(117,133,100,0.45) 0%, transparent 70%)",
                    filter: "blur(10px)",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}

              {/* Icon + label — scale up on active, tap feedback */}
              <motion.div
                animate={{ scale: active ? 1.12 : 1 }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={`relative flex flex-col items-center gap-[3px] px-4 py-[9px] transition-colors duration-150 ${
                  active ? "text-sage-deep" : "text-olive/40"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.6} />
                <span className="text-[9px] font-medium leading-none tracking-wide">
                  {label}
                </span>
              </motion.div>

              {/* Hover tooltip */}
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-olive px-2 py-1 text-[10px] text-cream opacity-0 transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
