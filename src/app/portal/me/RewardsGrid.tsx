"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clipboard, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatPoints } from "@/lib/utils";
import type { LoyaltyTier } from "@/lib/utils";
import { tierDisplayLabel, tierQualifies } from "@/lib/loyalty/utils";
import { redeemReward, giftFriendTrial } from "./actions";

interface Reward {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  cost_points: number;
  value_pence: number | null;
  percent_value: number | null;
  service_id: string | null;
  min_tier: string;
}

interface Props {
  rewards: Reward[];
  currentPoints: number;
  clientTier: LoyaltyTier;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "confirm"; reward: Reward }
  | { kind: "busy"; reward: Reward }
  | { kind: "voucher-success"; reward: Reward; voucherCode: string; newBalance: number }
  | { kind: "experience-success"; reward: Reward; newBalance: number }
  | { kind: "gift-form"; reward: Reward }
  | { kind: "gift-busy"; reward: Reward }
  | { kind: "gift-success"; reward: Reward; inviteCode: string }
  | { kind: "error"; reward: Reward; message: string };

export function RewardsGrid({ rewards, currentPoints, clientTier }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || rewards.length === 0) return;
    const cardW = el.scrollWidth / rewards.length;
    const idx = Math.min(
      Math.round(el.scrollLeft / cardW),
      rewards.length - 1
    );
    setActiveIdx(idx);
  }, [rewards.length]);

  function scrollTo(i: number) {
    const el = scrollRef.current;
    if (!el) return;
    const cardW = el.scrollWidth / rewards.length;
    el.scrollTo({ left: cardW * i, behavior: "smooth" });
  }

  function open(reward: Reward) {
    if (reward.kind === "gift_friend_session") {
      setState({ kind: "gift-form", reward });
    } else {
      setState({ kind: "confirm", reward });
    }
  }

  async function handleConfirm(reward: Reward) {
    setState({ kind: "busy", reward });
    const result = await redeemReward(reward.id);
    if (!result.ok) {
      setState({ kind: "error", reward, message: result.error });
      return;
    }
    if (result.kind === "voucher") {
      setState({
        kind: "voucher-success",
        reward,
        voucherCode: result.voucherCode,
        newBalance: result.newBalance,
      });
      return;
    }
    if (result.kind === "free_service") {
      setState({ kind: "closed" });
      startTransition(() => {
        router.push(
          `/portal/book?reward=${encodeURIComponent(result.redemptionId)}`
        );
      });
      return;
    }
    if (result.kind === "experience") {
      setState({
        kind: "experience-success",
        reward,
        newBalance: result.newBalance,
      });
      return;
    }
    // gift_friend_open_form (shouldn't reach here because we route gift
    // rewards to the gift-form branch above).
    setState({ kind: "gift-form", reward });
  }

  function close() {
    setState({ kind: "closed" });
    router.refresh();
  }

  return (
    <>
      {/* ── Horizontal carousel ─────────────────────────────────────────── */}
      <div className="-mx-4">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              currentPoints={currentPoints}
              clientTier={clientTier}
              onRedeem={() => open(reward)}
            />
          ))}
          {/* Right-edge breathing room */}
          <div className="w-1 flex-shrink-0" aria-hidden />
        </div>

        {/* Dot indicators */}
        {rewards.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5">
            {rewards.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Reward ${i + 1}`}
                onClick={() => scrollTo(i)}
                className={cn(
                  "h-[5px] rounded-full transition-all duration-200 ease-ios",
                  i === activeIdx
                    ? "w-5 bg-sage"
                    : "w-[5px] bg-olive/20"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={state.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          {state.kind === "confirm" && (
            <ConfirmView
              reward={state.reward}
              currentPoints={currentPoints}
              onCancel={close}
              onConfirm={() => handleConfirm(state.reward)}
              busy={pending}
            />
          )}
          {state.kind === "busy" && (
            <ConfirmView
              reward={state.reward}
              currentPoints={currentPoints}
              onCancel={close}
              onConfirm={() => handleConfirm(state.reward)}
              busy
            />
          )}
          {state.kind === "voucher-success" && (
            <VoucherSuccessView
              reward={state.reward}
              voucherCode={state.voucherCode}
              newBalance={state.newBalance}
              onClose={close}
            />
          )}
          {state.kind === "experience-success" && (
            <ExperienceSuccessView
              reward={state.reward}
              newBalance={state.newBalance}
              onClose={close}
            />
          )}
          {state.kind === "error" && (
            <ErrorView message={state.message} onClose={close} />
          )}
          {(state.kind === "gift-form" || state.kind === "gift-busy") && (
            <GiftFormView
              reward={state.reward}
              currentPoints={currentPoints}
              busy={state.kind === "gift-busy"}
              onCancel={close}
              onSubmit={async (input) => {
                setState({ kind: "gift-busy", reward: state.reward });
                const result = await giftFriendTrial(input);
                if (!result.ok) {
                  setState({
                    kind: "error",
                    reward: state.reward,
                    message: result.error,
                  });
                  return;
                }
                setState({
                  kind: "gift-success",
                  reward: state.reward,
                  inviteCode: result.inviteCode,
                });
              }}
            />
          )}
          {state.kind === "gift-success" && (
            <GiftSuccessView
              inviteCode={state.inviteCode}
              onClose={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RewardCard({
  reward,
  currentPoints,
  clientTier,
  onRedeem,
}: {
  reward: Reward;
  currentPoints: number;
  clientTier: LoyaltyTier;
  onRedeem: () => void;
}) {
  const tierOk = tierQualifies(clientTier, reward.min_tier as LoyaltyTier);
  const canAfford = currentPoints >= reward.cost_points;

  return (
    <Card className="flex w-[260px] flex-shrink-0 snap-start flex-col gap-3 p-5">
      <h3 className="font-serif text-[18px] font-medium leading-snug tracking-tight text-olive">
        {reward.name}
      </h3>
      {reward.description && (
        <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed tracking-snug text-olive-soft">
          {reward.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-[14px] font-medium tabular-nums text-sage-deep">
          {formatPoints(reward.cost_points)} pts
        </span>
        {!tierOk ? (
          <TierLockPill minTier={reward.min_tier as LoyaltyTier} />
        ) : canAfford ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onRedeem}
          >
            Redeem
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled
            className="text-[12px]"
          >
            Need {formatPoints(reward.cost_points - currentPoints)} more pts
          </Button>
        )}
      </div>
    </Card>
  );
}

function TierLockPill({ minTier }: { minTier: LoyaltyTier }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[12px] font-medium text-gold"
      style={{ background: "rgba(184,148,90,0.10)" }}
    >
      {tierDisplayLabel(minTier)} only
    </span>
  );
}

function ConfirmView({
  reward,
  currentPoints,
  onCancel,
  onConfirm,
  busy,
}: {
  reward: Reward;
  currentPoints: number;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const newBalance = currentPoints - reward.cost_points;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{reward.name}</DialogTitle>
        {reward.description && (
          <DialogDescription>{reward.description}</DialogDescription>
        )}
      </DialogHeader>
      <div className="mt-5 space-y-2">
        <Stat
          label="Cost"
          value={`${formatPoints(reward.cost_points)} pts`}
        />
        <Stat
          label="Balance after"
          value={`${formatPoints(newBalance)} pts`}
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>
          {busy ? "Redeeming" : "Confirm redemption"}
        </Button>
      </DialogFooter>
    </>
  );
}

function VoucherSuccessView({
  reward,
  voucherCode,
  newBalance,
  onClose,
}: {
  reward: Reward;
  voucherCode: string;
  newBalance: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(voucherCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Saved to your account ✨</DialogTitle>
        <DialogDescription>
          Show this code at the till to apply your {reward.name.toLowerCase()}.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border-[0.5px] border-hairline bg-cream-deep px-4 py-3">
        <span className="font-serif text-[22px] font-medium tracking-tight tabular-nums text-olive">
          {voucherCode}
        </span>
        <button
          type="button"
          onClick={copy}
          className="ax-tap flex h-9 w-9 items-center justify-center rounded-full bg-white text-olive transition-colors duration-200 ease-ios"
          aria-label="Copy code"
        >
          {copied ? (
            <Check size={16} strokeWidth={1.6} className="text-sage" />
          ) : (
            <Clipboard size={16} strokeWidth={1.6} />
          )}
        </button>
      </div>
      <p className="mt-3 text-[12px] tracking-snug text-olive-soft">
        New balance: {formatPoints(newBalance)} pts
      </p>
      <DialogFooter>
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function ExperienceSuccessView({
  reward,
  newBalance,
  onClose,
}: {
  reward: Reward;
  newBalance: number;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Sculpt Day requested ✨</DialogTitle>
        <DialogDescription>
          Nigel will reach out within 24 hours to schedule your {reward.name.toLowerCase()}.
        </DialogDescription>
      </DialogHeader>
      <p className="mt-4 text-[12px] tracking-snug text-olive-soft">
        New balance: {formatPoints(newBalance)} pts
      </p>
      <DialogFooter>
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function ErrorView({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>That didn&rsquo;t work</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function GiftFormView({
  reward,
  currentPoints,
  busy,
  onCancel,
  onSubmit,
}: {
  reward: Reward;
  currentPoints: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    friendName: string;
    friendPhone: string;
    friendEmail?: string;
    message?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gift a friend a free trial</DialogTitle>
        <DialogDescription>
          {reward.description ??
            "Choose someone who'd love Astrabody. We'll send her a free InfraBike trial in your name. You earn +200 pts when she shows up."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            friendName: name,
            friendPhone: phone,
            friendEmail: email || undefined,
            message: msg || undefined,
          });
        }}
      >
        <FieldInput
          label="Friend's name"
          value={name}
          onChange={setName}
          placeholder="Sarah"
          autoComplete="off"
        />
        <FieldInput
          label="Phone (UK or international)"
          value={phone}
          onChange={setPhone}
          placeholder="+44 7…"
          inputMode="tel"
          autoComplete="off"
        />
        <FieldInput
          label="Email (optional)"
          value={email}
          onChange={setEmail}
          placeholder="sarah@example.com"
          inputMode="email"
          autoComplete="off"
          type="email"
        />
        <FieldInput
          label="Short message (optional)"
          value={msg}
          onChange={(v) => setMsg(v.slice(0, 200))}
          placeholder="Try this place I love"
        />
        <p className="text-[11px] tracking-snug text-olive-faint">
          Cost: {formatPoints(reward.cost_points)} pts. Balance after:{" "}
          {formatPoints(currentPoints - reward.cost_points)} pts.
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || !name.trim() || !phone.trim()}
          >
            {busy ? "Sending" : "Send the gift"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function GiftSuccessView({
  inviteCode,
  onClose,
}: {
  inviteCode: string;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Sent ✨</DialogTitle>
        <DialogDescription>
          We&rsquo;ve sent the gift. You&rsquo;ll earn +200 pts when she
          shows up for her trial.
        </DialogDescription>
      </DialogHeader>
      <p className="mt-4 text-[11px] tracking-snug text-olive-faint">
        Invite code: <span className="tabular-nums text-olive-soft">{inviteCode}</span>
      </p>
      <DialogFooter>
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] tracking-snug text-olive-soft">
        {label}
      </span>
      <span className="font-serif text-[18px] font-medium tabular-nums text-olive">
        {value}
      </span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
        )}
        {...rest}
      />
    </label>
  );
}
