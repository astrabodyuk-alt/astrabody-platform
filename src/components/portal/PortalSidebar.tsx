"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  MessageCircle,
  ShoppingBag,
  User,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/browser";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/portal",      label: "Dashboard", Icon: LayoutDashboard },
  { href: "/portal/book", label: "Book",       Icon: Calendar },
  { href: "/portal/chat", label: "Chat",       Icon: MessageCircle },
  { href: "/portal/shop", label: "Shop",       Icon: ShoppingBag },
  { href: "/portal/me",   label: "Profile",    Icon: User },
] as const;

const TEAM = [
  { name: "Tove",  role: "Therapist", bg: "#DED2C3", fg: "#3E3E31" },
  { name: "Jade",  role: "Therapist", bg: "#BBC4AA", fg: "#3E3E31" },
  { name: "Nigel", role: "Founder",   bg: "#758564", fg: "#F6F3EE" },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function PortalSidebar({ clientName }: { clientName?: string }) {
  const pathname = usePathname() ?? "";
  const router   = useRouter();

  // Don't render on login page
  if (pathname.startsWith("/portal/login")) return null;

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/portal/login");
  }

  return (
    <aside className="hidden md:flex w-[196px] flex-shrink-0 flex-col gap-5 bg-cream border-r border-sand/60 px-3 py-4 min-h-screen sticky top-0 self-start">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-1 py-0.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-sage">
          <Sparkles size={13} strokeWidth={1.8} className="text-cream" />
        </div>
        <span className="font-serif text-[17px] font-medium tracking-tight text-olive">
          Astrabody
        </span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-[8px] border border-sand bg-white/70 px-3 py-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#BBC4AA" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span className="text-[12px] text-sage-light">Search...</span>
      </div>

      {/* Navigation */}
      <div>
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-olive/30">
          Overview
        </p>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active =
              href === "/portal"
                ? pathname === "/portal"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] transition-colors",
                  active
                    ? "bg-sage font-medium text-cream"
                    : "text-olive hover:bg-sand/50"
                )}
              >
                <Icon
                  size={14}
                  strokeWidth={active ? 2 : 1.6}
                  className={active ? "text-cream" : "text-sage"}
                />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Team */}
      <div>
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-olive/30">
          Your team
        </p>
        <div className="flex flex-col gap-2.5 px-1">
          {TEAM.map(({ name, role, bg, fg }) => (
            <div key={name} className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: bg, color: fg }}
              >
                {name[0]}
              </div>
              <div>
                <p className="text-[12px] font-medium leading-none text-olive">{name}</p>
                <p className="mt-0.5 text-[11px] leading-none text-olive/40">{role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings + Logout */}
      <div className="mt-auto flex flex-col gap-0.5">
        <Link
          href="/portal/me"
          className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] text-olive transition-colors hover:bg-sand/50"
        >
          <Settings size={14} strokeWidth={1.6} className="text-sage" />
          Settings
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] text-destructive transition-colors hover:bg-destructive/5"
        >
          <LogOut size={14} strokeWidth={1.6} className="text-destructive" />
          Logout
        </button>
      </div>
    </aside>
  );
}
