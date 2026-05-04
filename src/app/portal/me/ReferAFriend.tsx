"use client";

import { useState } from "react";
import { Copy, MessageCircle, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";

export interface ReferAFriendProps {
  referralCode: string;
  total: number;
  converted: number;
  earnedPence: number;
  referrerCreditPence: number;
  referredCreditPence: number;
  tenantName: string;
  portalBookUrl: string;
}

export function ReferAFriend({
  referralCode,
  total,
  converted,
  earnedPence,
  referrerCreditPence,
  referredCreditPence,
  tenantName,
  portalBookUrl,
}: ReferAFriendProps) {
  const [copied, setCopied] = useState(false);

  const link = `${portalBookUrl}?ref=${referralCode}`;
  const bothLabel =
    referrerCreditPence === referredCreditPence
      ? `both get ${formatGBP(referrerCreditPence)} in credit`
      : `you get ${formatGBP(referrerCreditPence)}, they get ${formatGBP(referredCreditPence)}`;
  const waMessage = `I've been going to ${tenantName} — you'd love it. Use my link to book and we both get ${formatGBP(referredCreditPence)} credit: ${link}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select and execCommand only as a last resort —
      // modern browsers allow clipboard from a user-gesture handler.
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-serif text-[20px] font-medium leading-tight tracking-tight text-olive">
        Invite a friend, {bothLabel}
      </h3>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        They use your link to book. Once their first session is done, the
        credit lands in both wallets.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 truncate rounded-lg border border-olive/15 bg-cream px-3 py-2 font-mono text-[12px] tracking-snug text-olive">
          {link}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={copyLink}
          className="gap-1.5 sm:min-w-[112px]"
        >
          {copied ? (
            <>
              <Check className="size-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copy link
            </>
          )}
        </Button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-sage px-3 text-[13px] font-medium text-cream transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Invited" value={total.toString()} />
        <Stat label="Converted" value={converted.toString()} />
        <Stat label="Earned" value={formatGBP(earnedPence)} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-olive/10 bg-sand/20 px-2 py-2">
      <div className="font-serif text-[20px] font-medium leading-tight tracking-tight text-olive tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-snug text-olive-soft">
        {label}
      </div>
    </div>
  );
}
