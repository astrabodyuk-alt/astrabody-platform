"use client";

import { useEffect, useState, useTransition } from "react";
import {
  TrendingUp,
  Gift,
  Mail,
  Calendar,
  Zap,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ensureCoachRecommendations,
  refreshCoachRecommendations,
} from "./actions";
import type {
  CoachIcon,
  CoachRecommendation,
  CachedRecommendations,
} from "@/lib/coach/generator";

const ICON_MAP: Record<CoachIcon, typeof TrendingUp> = {
  "trending-up": TrendingUp,
  gift: Gift,
  mail: Mail,
  calendar: Calendar,
  zap: Zap,
};

/**
 * "This month's plan" — AI-generated coach recommendations.
 *
 * Renders cached recs immediately when the parent passed any. On first
 * mount with no cache, kicks off generation in the background (only an
 * owner has the role to actually trigger it; non-owners see the empty
 * state until an owner has hit Refresh once).
 *
 * The Refresh button is owner-only and server-throttled to one call
 * per 24h.
 */
export function CoachCard({
  initialCached,
  isOwner,
}: {
  initialCached: CachedRecommendations | null;
  isOwner: boolean;
}) {
  const [cached, setCached] = useState<CachedRecommendations | null>(
    initialCached
  );
  const [generating, setGenerating] = useState(!initialCached);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Background-generate on first mount when nothing is cached. Only
  // owners can actually trigger generation server-side; the call from
  // a non-owner returns "no recommendations yet" silently.
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    setGenerating(true);
    ensureCoachRecommendations()
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setCached(r.data);
          setError(null);
        } else if (!isOwner) {
          setError("Ask the owner to generate this month's plan.");
        } else {
          setError(r.error);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "couldn't load");
        }
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cached, isOwner]);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshCoachRecommendations();
      if (r.ok) {
        setCached(r.data);
      } else {
        setError(r.error);
      }
    });
  }

  if (generating && !cached) {
    return (
      <Card className="p-5">
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Recommendations from your AI advisor
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[68px] w-full animate-pulse rounded-[14px] bg-cream-deep/70"
            />
          ))}
        </div>
        <p className="mt-4 text-[12px] tracking-snug text-olive-soft">
          Working on this month&rsquo;s plan…
        </p>
      </Card>
    );
  }

  if (!cached) {
    return (
      <Card className="p-5">
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Recommendations from your AI advisor
        </h2>
        <p className="mt-3 text-[13px] tracking-snug text-olive-soft">
          {error ?? "No plan generated yet."}
        </p>
        {isOwner && (
          <div className="mt-4">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleRefresh}
              disabled={pending}
            >
              {pending ? "Generating" : "Generate this month's plan"}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  const generated = relativeTime(cached.generatedAt);

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Recommendations from your AI advisor
        </h2>
        {isOwner && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pending}
            aria-label="Refresh recommendations"
            className="flex h-8 w-8 items-center justify-center rounded-full text-olive-soft transition-colors duration-200 ease-ios hover:bg-cream-deep hover:text-olive disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              strokeWidth={1.6}
              className={pending ? "animate-spin" : ""}
            />
          </button>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {cached.recommendations.map((r, i) => (
          <li key={i}>
            <RecRow rec={r} />
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] tracking-snug text-olive-faint">
        Generated {generated}. Refreshes weekly. Not financial advice.
      </p>
      {error && (
        <p className="mt-2 text-[12px] tracking-snug text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}

function RecRow({ rec }: { rec: CoachRecommendation }) {
  const Icon = ICON_MAP[rec.icon] ?? Zap;
  return (
    <div className="rounded-[14px] bg-cream-deep px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-sage-deep"
          aria-hidden
        >
          <Icon size={14} strokeWidth={1.6} />
        </span>
        <div className="flex-1">
          <p className="text-[15px] font-medium leading-snug tracking-snug text-sage-deep">
            {rec.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug tracking-snug text-olive-soft">
            {rec.body}
          </p>
          {rec.cta && (
            <div className="mt-2">
              {rec.cta_href ? (
                <a
                  href={rec.cta_href}
                  className="inline-flex items-center rounded-full border-[0.5px] border-hairline-strong bg-white px-3 py-1 text-[12px] font-medium tracking-snug text-olive transition-colors duration-200 ease-ios hover:bg-cream-deep"
                >
                  {rec.cta}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border-[0.5px] border-hairline bg-white px-3 py-1 text-[12px] font-medium tracking-snug text-olive-soft">
                  {rec.cta}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
