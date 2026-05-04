"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ActivePack } from "@/lib/portal/packs";

/**
 * "Your packs" card on /portal home. Shown only when the client has at
 * least one active pack. Each row has a sage progress bar (sessions
 * remaining), expiry, and is tap-to-expand for purchase details.
 *
 * Sage on cream-deep — never red, even at 1 session left. Premium feel:
 * "1 session left" reads as plenty, not panic.
 */
export function YourPacksCard({ packs }: { packs: ActivePack[] }) {
  if (packs.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Your packs
      </h2>
      <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
        Sessions credited to your account &middot; book straight from any
        treatment page.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {packs.map((p) => (
          <li key={p.id}>
            <PackRow pack={p} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PackRow({ pack }: { pack: ActivePack }) {
  const [open, setOpen] = useState(false);
  const pct = Math.max(
    0,
    Math.min(100, (pack.sessionsRemaining / pack.sessionsTotal) * 100)
  );
  const expiresInDays = Math.max(
    0,
    Math.ceil((new Date(pack.expiresAt).getTime() - Date.now()) / 86_400_000)
  );

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={cn(
        "w-full rounded-[14px] bg-cream-deep px-4 py-3 text-left transition-colors duration-200 ease-ios",
        "hover:bg-cream-deep/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium tracking-snug text-olive">
          {pack.name}
        </p>
        <span className="text-[12px] font-medium tabular-nums tracking-snug text-olive">
          {pack.sessionsRemaining} of {pack.sessionsTotal} left
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-sage transition-[width] duration-300 ease-ios"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
        Expires in {expiresInDays} day{expiresInDays === 1 ? "" : "s"}
      </p>
      {open && (
        <div className="mt-3 flex flex-col gap-1 border-t-[0.5px] border-hairline pt-3 text-[12px] tracking-snug text-olive-soft">
          {pack.serviceName && <p>Service &middot; {pack.serviceName}</p>}
          {pack.soldAt && (
            <p>Bought on {formatDate(pack.soldAt)}</p>
          )}
          <p>Expires {formatDate(pack.expiresAt)}</p>
        </div>
      )}
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}
