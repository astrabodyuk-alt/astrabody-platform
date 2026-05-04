"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Today", exact: true },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {ITEMS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-medium tracking-snug transition-colors duration-200 ease-ios",
              active
                ? "bg-cream-deep text-olive"
                : "text-olive-soft hover:bg-cream-deep/50 hover:text-olive"
            )}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
