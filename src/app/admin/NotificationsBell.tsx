"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarCheck,
  Mail,
  Wallet,
  ShieldAlert,
  Star,
  Sparkles,
  Cake,
  Clock,
  CalendarX,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import type { NotificationKind } from "@/lib/notifications/insert";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  actionUrl: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  readAt: string | null;
  createdAt: string;
}

/**
 * Bell + dropdown component that lives at the right edge of AdminNav.
 * Adapts the 21st.dev pattern to Astrabody's sage / cream palette:
 *   - Bell icon: text-sage
 *   - Badge: bg-[#FF3B30] text-white (Apple iOS red)
 *   - Dropdown: cream background, hairline borders, sage hover
 *   - Mobile (< 640px): dropdown becomes a full-screen sheet from the bottom
 */
export function NotificationsBell({
  initial,
}: {
  initial: NotificationItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>(initial);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep local list synced when server data changes (parent re-renders
  // after a navigation revalidation).
  useEffect(() => {
    setList(initial);
  }, [initial]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = list.filter((n) => !n.readAt);
  const unreadCount = unread.length;

  function handleClickItem(item: NotificationItem) {
    setOpen(false);
    // Optimistic mark-as-read.
    if (!item.readAt) {
      setList((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      startTransition(async () => {
        await markNotificationRead(item.id);
      });
    }
    if (item.actionUrl) {
      router.push(item.actionUrl);
    }
  }

  function handleMarkAll() {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setList((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-hairline-strong bg-white text-sage transition-colors duration-200 ease-ios hover:bg-cream-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50"
      >
        <BellRing size={18} strokeWidth={1.6} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
            style={{ background: "#FF3B30" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop (only visible < 640px). */}
          <div
            className="fixed inset-0 z-40 bg-olive/30 backdrop-blur-sm sm:hidden"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={cn(
              "z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-[14px] border-[0.5px] border-hairline-strong bg-cream shadow-2",
              "fixed inset-x-3 bottom-3 sm:absolute sm:inset-auto sm:right-0 sm:top-[44px] sm:w-[360px]"
            )}
          >
            <div className="flex items-baseline justify-between gap-3 border-b-[0.5px] border-hairline px-4 py-3">
              <h2 className="font-serif text-[16px] font-medium tracking-tight text-olive">
                Notifications
              </h2>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={pending}
                  className="text-[12px] font-medium tracking-snug text-sage-deep underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] tracking-snug text-olive-soft">
                    All caught up · No new notifications
                  </p>
                </div>
              ) : (
                <ul>
                  {list.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleClickItem(item)}
                        className={cn(
                          "flex w-full items-start gap-3 border-b-[0.5px] border-hairline px-4 py-3 text-left transition-colors duration-150 ease-ios last:border-b-0",
                          "hover:bg-sage/5 focus-visible:bg-sage/5 focus-visible:outline-none"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full",
                            item.readAt ? "bg-transparent" : "bg-sage"
                          )}
                        />
                        <span
                          aria-hidden
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cream-deep text-sage-deep"
                        >
                          <KindIcon kind={item.kind} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                "truncate text-[14px] tracking-snug text-sage-deep",
                                !item.readAt && "font-medium"
                              )}
                            >
                              {item.title}
                            </p>
                            <span className="flex-shrink-0 text-[11px] tracking-snug text-olive-faint">
                              {relativeTime(item.createdAt)}
                            </span>
                          </div>
                          {item.body && (
                            <p className="mt-0.5 line-clamp-2 text-[13px] tracking-snug text-olive-soft">
                              {item.body}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICON_BY_KIND[kind] ?? BellRing;
  return <Icon size={14} strokeWidth={1.6} />;
}

const ICON_BY_KIND: Record<NotificationKind, typeof BellRing> = {
  monthly_payroll_ready: Wallet,
  noshow_charged: CreditCard,
  noshow_charge_failed: ShieldAlert,
  late_cancel_charged: CreditCard,
  review_received: Star,
  google_review_posted: Star,
  coach_refreshed: Sparkles,
  new_chat_message: Mail,
  birthday_today: Cake,
  pack_expiring_soon: Clock,
  booking_confirmed: CalendarCheck,
  booking_cancelled: CalendarX,
  card_declined: ShieldAlert,
  staff_time_off_added: Clock,
  studio_closure_added: CalendarX,
  bank_holiday_reminder: CalendarCheck,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
