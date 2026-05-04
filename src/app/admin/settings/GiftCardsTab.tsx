"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";
import {
  describeGiftCardStatus,
  type GiftCardRow,
} from "@/lib/gift-cards/shared";
import {
  issueManualGiftCard,
  voidGiftCard,
} from "@/lib/gift-cards/actions";

interface Props {
  cards: GiftCardRow[];
  isOwner: boolean;
  isOwnerOrAdmin: boolean;
}

export function GiftCardsTab({ cards, isOwner, isOwnerOrAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [showManual, setShowManual] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.recipient_email ?? "").toLowerCase().includes(q) ||
        (c.recipient_name ?? "").toLowerCase().includes(q)
    );
  }, [cards, search]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
            Gift cards
          </h2>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            Active codes, redemption history, and manual issuance.
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Button
            size="sm"
            onClick={() => setShowManual(true)}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Issue manual
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-olive/15 bg-cream px-3 py-2">
        <Search className="size-4 text-olive-soft" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, email, or recipient name"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-olive placeholder:text-olive-soft/70 focus:outline-none"
        />
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {filtered.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            {cards.length === 0
              ? "No gift cards yet."
              : "No cards match that search."}
          </li>
        )}
        {filtered.map((c) => (
          <GiftCardRowItem
            key={c.id}
            card={c}
            isOwner={isOwner}
          />
        ))}
      </ul>

      {showManual && (
        <ManualIssueSheet onClose={() => setShowManual(false)} />
      )}
    </Card>
  );
}

function GiftCardRowItem({
  card,
  isOwner,
}: {
  card: GiftCardRow;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const status = describeGiftCardStatus(card);
  const sentAt = new Date(card.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const expiry = new Date(card.expires_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[13px] font-medium tracking-snug text-olive">
            {card.code}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
          {formatGBP(card.balance_pence)} of {formatGBP(card.initial_pence)}
          {card.recipient_name && ` · ${card.recipient_name}`}
          {card.recipient_email && ` · ${card.recipient_email}`}
        </div>
        <div className="text-[11px] tracking-snug text-olive-soft">
          Sent {sentAt} · expires {expiry}
        </div>
      </div>

      {isOwner && status === "active" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await voidGiftCard(card.id);
              router.refresh();
            })
          }
        >
          Void
        </Button>
      )}
    </li>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "redeemed" | "voided" | "expired";
}) {
  if (status === "active") {
    return (
      <span className="rounded-full bg-sage/20 px-2 py-0.5 text-[11px] tracking-snug text-sage-deep">
        Active
      </span>
    );
  }
  if (status === "redeemed") {
    return (
      <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] tracking-snug text-olive">
        Redeemed
      </span>
    );
  }
  if (status === "voided") {
    return (
      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] tracking-snug text-destructive">
        Voided
      </span>
    );
  }
  return (
    <span className="rounded-full bg-olive/10 px-2 py-0.5 text-[11px] tracking-snug text-olive-soft">
      Expired
    </span>
  );
}

function ManualIssueSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amountPounds, setAmountPounds] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-olive/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-cream p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-[18px] font-medium text-olive">
          Issue a manual gift card
        </h3>
        <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
          For compensation or goodwill. The recipient gets the email
          immediately. No charge to anyone.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Amount (£)
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={amountPounds}
              onChange={(e) => setAmountPounds(e.target.value)}
              placeholder="50"
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Recipient name
            </span>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Recipient email
            </span>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Personal message (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 200))}
              rows={3}
              maxLength={200}
              className="resize-y rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                const pounds = Math.round(Number(amountPounds));
                if (!Number.isFinite(pounds) || pounds < 1) {
                  setError("Amount must be at least £1.");
                  return;
                }
                startTransition(async () => {
                  setError(null);
                  const res = await issueManualGiftCard({
                    amountPence: pounds * 100,
                    recipientName,
                    recipientEmail,
                    personalMessage: message,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  router.refresh();
                  onClose();
                });
              }}
            >
              {pending ? "Issuing…" : "Issue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
