"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Wallet, CreditCard, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { markNotificationRead } from "@/lib/notifications/actions";

interface BannerItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  priority: string;
}

const ICONS: Record<string, typeof ShieldAlert> = {
  monthly_payroll_ready: Wallet,
  noshow_charge_failed: ShieldAlert,
  card_declined: CreditCard,
};

/**
 * Sage-deep banners on /admin home for unread urgent / actionable
 * notifications. Up to 3 visible; "show more" expands the rest. Tapping
 * the action button marks the row read + navigates to action_url.
 */
export function HomeBanners({ items }: { items: BannerItem[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const visible = items.filter((b) => !hidden.has(b.id));
  if (visible.length === 0) return null;

  const above = expanded ? visible : visible.slice(0, 3);
  const overflow = visible.length - above.length;

  function handleAction(item: BannerItem) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    startTransition(async () => {
      await markNotificationRead(item.id);
    });
    if (item.actionUrl) router.push(item.actionUrl);
  }

  return (
    <div className="flex flex-col gap-2">
      {above.map((b) => {
        const Icon = ICONS[b.kind] ?? ShieldAlert;
        return (
          <Card
            key={b.id}
            className="flex items-center gap-3 border-[0.5px] border-sage/30 bg-sage/10 p-4"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-sage-deep"
            >
              <Icon size={16} strokeWidth={1.6} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium tracking-snug text-sage-deep">
                {b.title}
              </p>
              {b.body && (
                <p className="mt-0.5 text-[13px] tracking-snug text-olive-soft">
                  {b.body}
                </p>
              )}
            </div>
            {b.actionUrl && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleAction(b)}
                className="flex-shrink-0"
              >
                Take me there
                <ChevronRight size={14} strokeWidth={1.6} className="ml-1" />
              </Button>
            )}
          </Card>
        );
      })}
      {overflow > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-[12px] font-medium tracking-snug text-sage-deep underline-offset-2 hover:underline"
        >
          Show {overflow} more
        </button>
      )}
    </div>
  );
}
