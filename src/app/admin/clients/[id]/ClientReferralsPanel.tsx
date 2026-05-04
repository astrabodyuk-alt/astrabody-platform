"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";
import { markReferralRewardedManually } from "./actions";

interface ReferralAsReferrer {
  id: string;
  status: "pending" | "converted" | "rewarded";
  converted_at: string | null;
  rewarded_at: string | null;
  referrer_credit_pence: number;
  referred_name: string | null;
}

export function ClientReferralsPanel({
  referralCode,
  asReferrer,
  asReferred,
}: {
  referralCode: string | null;
  asReferrer: ReferralAsReferrer[];
  asReferred: { id: string; status: string; referrer_name: string | null } | null;
}) {
  const totalRewarded = asReferrer.reduce(
    (acc, r) =>
      r.status === "rewarded" ? acc + r.referrer_credit_pence : acc,
    0
  );
  const converted = asReferrer.filter((r) => r.status === "converted").length;
  const rewarded = asReferrer.filter((r) => r.status === "rewarded").length;

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] tracking-snug text-olive-soft">
          Referral code:
        </span>
        <span className="font-mono text-[14px] font-medium text-olive">
          {referralCode ?? "—"}
        </span>
      </div>

      {asReferred && (
        <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
          Referred by {asReferred.referrer_name ?? "another client"} ·
          status: {asReferred.status}
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Invited" value={String(asReferrer.length)} />
        <Mini label="Converted" value={String(converted)} />
        <Mini label="Rewarded" value={String(rewarded)} />
      </div>
      <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
        Earned: {formatGBP(totalRewarded)}
      </p>

      <ul className="mt-4 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {asReferrer.length === 0 && (
          <li className="py-3 text-[13px] tracking-snug text-olive-soft">
            No referrals yet.
          </li>
        )}
        {asReferrer.map((r) => (
          <ReferralRow key={r.id} r={r} />
        ))}
      </ul>
    </Card>
  );
}

function ReferralRow({ r }: { r: ReferralAsReferrer }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-[14px] text-olive">
          {r.referred_name ?? "Friend"}
        </div>
        <div className="text-[12px] tracking-snug text-olive-soft">
          {r.status === "rewarded" && r.rewarded_at
            ? `Rewarded ${new Date(r.rewarded_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })} · ${formatGBP(r.referrer_credit_pence)}`
            : r.status === "converted" && r.converted_at
              ? `Converted ${new Date(r.converted_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })} — waiting on first session`
              : "Pending"}
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
      {r.status === "converted" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await markReferralRewardedManually(r.id);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "Rewarding…" : "Reward now"}
        </Button>
      )}
    </li>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-olive/10 bg-sand/20 px-2 py-2">
      <div className="font-serif text-[18px] font-medium tabular-nums text-olive">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-snug text-olive-soft">
        {label}
      </div>
    </div>
  );
}
