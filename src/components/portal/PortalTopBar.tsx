"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
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
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
        { label: "Book a session",  sublabel: "Check availability",       href: "/portal/book",            icon: Calendar },
        { label: "Recent sessions", sublabel: "Book again",               href: "/portal/me#sessions",     icon: Clock },
      ],
    },
    {
      title: "Rewards",
      items: [
        { label: "How I earned",   sublabel: "Points history",            href: "/portal/me#points",       icon: Star },
        { label: "Spend my points",sublabel: "Vouchers & discounts",      href: "/portal/me#rewards",      icon: Gift },
        { label: "Refer a friend", sublabel: "Earn £10 credit each",      href: "/portal/me#referral",     icon: Repeat2 },
        { label: "Shop",           sublabel: "Nutrition & digital products", href: "/portal/shop",         icon: ShoppingBag },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "Chat with us",   sublabel: "Message the studio",        href: "/portal/chat",            icon: MessageCircle },
        { label: "My profile",     sublabel: clientName,                  href: "/portal/me",              icon: User },
        { label: "Settings",       sublabel: "Preferences & notifications", href: "/portal/me",            icon: Settings },
      ],
    },
  ];

  // Initials from clientName
  const initials = clientName
    ? clientName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────── */}
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
          className="transition-opacity active:opacity-70"
        >
          <Avatar className="h-9 w-9 ring-1 ring-olive/15 ring-offset-1 ring-offset-cream">
            <AvatarFallback
              className="text-[12px] font-semibold text-cream"
              style={{ background: "linear-gradient(135deg, #758564, #4a5c38)" }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </header>

      {/* ── Full-screen dark menu ────────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col transition-all duration-350 ease-ios",
          open ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-4"
        )}
        style={{
          background: "linear-gradient(160deg, #1e2818 0%, #161c10 55%, #111509 100%)",
        }}
        aria-label="Navigation menu"
      >
        {/* ── Header ── */}
        <div className="flex h-14 shrink-0 items-center justify-between px-5 pt-safe">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 active:bg-white/15"
          >
            <X size={20} strokeWidth={1.6} />
          </button>
          <span className="font-serif text-[17px] font-medium tracking-tight text-white/80">
            Menu
          </span>
          <div className="w-9" aria-hidden /> {/* spacer */}
        </div>

        {/* ── Profile card ── */}
        <Link
          href="/portal/me"
          onClick={() => setOpen(false)}
          className="mx-4 mt-3 flex items-center gap-3.5 rounded-[18px] px-4 py-3.5 transition-colors active:bg-white/10"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0 ring-1 ring-white/20">
            <AvatarFallback
              className="text-[15px] font-semibold text-cream"
              style={{ background: "linear-gradient(135deg, #758564, #4a5c38)" }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-white">
              {clientName || "Your profile"}
            </p>
            <p className="text-[12px] text-white/40">Inner Circle member</p>
          </div>
          <ChevronRight size={16} strokeWidth={1.6} className="text-white/25" />
        </Link>

        {/* ── Sections ── */}
        <nav className="flex-1 overflow-y-auto px-4 py-4">
          {sections.map((section, si) => (
            <div key={section.title} className={cn(si > 0 && "mt-4")}>
              {/* Section title */}
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">
                {section.title}
              </p>

              {/* Section group */}
              <div
                className="overflow-hidden rounded-[16px]"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {section.items.map((item, ii) => {
                  const Icon = item.icon;

                  const inner = (
                    <div className="flex w-full items-center gap-3.5 px-4 py-3 transition-colors active:bg-white/10">
                      {/* Icon box */}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ background: "rgba(117,133,100,0.20)" }}
                      >
                        <Icon size={15} strokeWidth={1.6} style={{ color: "#BBC4AA" }} />
                      </div>
                      {/* Text */}
                      <div className="flex-1 text-left">
                        <p className="text-[14px] font-medium text-white/85">{item.label}</p>
                        {item.sublabel && (
                          <p className="mt-0.5 text-[11px] text-white/35">{item.sublabel}</p>
                        )}
                      </div>
                      <ChevronRight size={14} strokeWidth={1.6} className="text-white/20" />
                    </div>
                  );

                  return (
                    <div key={item.label}>
                      {ii > 0 && (
                        <div className="ml-[58px] h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                      )}
                      {item.href ? (
                        <Link href={item.href} onClick={() => setOpen(false)}>{inner}</Link>
                      ) : (
                        <button type="button" className="w-full" onClick={() => { setOpen(false); item.onClick?.(); }}>
                          {inner}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Log out ── */}
        <div className="shrink-0 px-4 pb-8 pt-2">
          <button
            type="button"
            onClick={() => { setOpen(false); signOut(); }}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[16px] transition-colors active:opacity-80"
            style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <LogOut size={16} strokeWidth={1.8} className="text-destructive" />
            <span className="text-[15px] font-semibold text-destructive">Log Out</span>
          </button>

          {/* Footer */}
          <p className="mt-4 text-center text-[10px] tracking-wide text-white/15">
            Astrabody · 149 Hursley Road, Chandler's Ford
          </p>
        </div>
      </div>
    </>
  );
}
