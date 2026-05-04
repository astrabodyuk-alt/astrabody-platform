"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { format } from "date-fns";
import { X, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { portalAssistantChat } from "@/lib/portal-assistant/actions";
import {
  assistantBookingHandoffUrl,
  assistantFetchSlots,
  type AssistantSlot,
} from "@/lib/portal-assistant/booking-bridge";
import type {
  AssistantAction,
  AssistantReply,
  ChatMessage,
} from "@/lib/portal-assistant/types";

type ThreadItem =
  | { kind: "user"; content: string; id: string }
  | { kind: "assistant"; content: string; id: string }
  | {
      kind: "slots";
      id: string;
      serviceId: string;
      serviceName: string;
      date: string;
      slots: AssistantSlot[];
      timeWindow?: "morning" | "afternoon" | "evening" | null;
    }
  | {
      kind: "handoff";
      id: string;
      serviceName: string;
      slotDatetime: string;
      staffName: string;
      url: string;
    };

const STARTER_CHIPS = [
  "Book a session",
  "My sessions remaining",
  "Current offers",
  "My next appointment",
  "What should I try next?",
];

export function AssistantModal({ onClose }: { onClose: () => void }) {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread, pending]);

  // ESC closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pushUser(content: string): ChatMessage[] {
    const next: ThreadItem[] = [
      ...thread,
      { kind: "user", content, id: crypto.randomUUID() },
    ];
    setThread(next);
    return threadToMessages(next);
  }

  function send(content: string): void {
    const text = content.trim();
    if (!text || pending) return;
    setError(null);
    setDraft("");
    const messages = pushUser(text);
    runChat(messages);
  }

  function runChat(messages: ChatMessage[]): void {
    startTransition(async () => {
      const res = await portalAssistantChat({ messages });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await applyReply(res.reply);
    });
  }

  async function applyReply(reply: AssistantReply): Promise<void> {
    setThread((prev) => [
      ...prev,
      { kind: "assistant", content: reply.message, id: crypto.randomUUID() },
    ]);
    if (reply.action) {
      await dispatchAction(reply.action);
    }
  }

  async function dispatchAction(action: AssistantAction): Promise<void> {
    if (!action) return;
    if (action.type === "SHOW_SLOTS") {
      const res = await assistantFetchSlots({
        serviceId: action.serviceId,
        date: action.date,
      });
      if (!res.ok) {
        appendAssistant(`Sorry — ${res.error}`);
        return;
      }
      if (res.slots.length === 0) {
        appendAssistant(
          `Nothing free for ${res.serviceName} on ${format(new Date(`${action.date}T00:00:00`), "EEEE d MMMM")}. Want me to try another day?`
        );
        return;
      }
      setThread((prev) => [
        ...prev,
        {
          kind: "slots",
          id: crypto.randomUUID(),
          serviceId: action.serviceId,
          serviceName: res.serviceName,
          date: action.date,
          slots: res.slots,
          timeWindow: action.type === "SHOW_SLOTS" ? (action.timeWindow ?? null) : null,
        },
      ]);
      return;
    }
    if (action.type === "CONFIRM_BOOKING") {
      const handoff = await assistantBookingHandoffUrl({
        serviceId: action.serviceId,
        slotDatetime: action.slotDatetime,
        staffId: action.staffId ?? null,
      });
      // Resolve a name for the staff, falling back to "the team".
      let staffName = "the team";
      const slotsCard = thread.find(
        (t) => t.kind === "slots" && t.serviceId === action.serviceId
      );
      if (slotsCard && slotsCard.kind === "slots") {
        const match = slotsCard.slots.find(
          (s) => s.datetime === action.slotDatetime
        );
        if (match) staffName = match.staffName;
      }
      // Look up the service name from the same card if we have it.
      const serviceName =
        slotsCard && slotsCard.kind === "slots"
          ? slotsCard.serviceName
          : "your session";
      setThread((prev) => [
        ...prev,
        {
          kind: "handoff",
          id: crypto.randomUUID(),
          serviceName,
          slotDatetime: action.slotDatetime,
          staffName,
          url: handoff.url,
        },
      ]);
      return;
    }
    // CLARIFY_DATE / CLARIFY_SERVICE / RECOMMEND — message text alone is enough.
  }

  function appendAssistant(content: string): void {
    setThread((prev) => [
      ...prev,
      { kind: "assistant", content, id: crypto.randomUUID() },
    ]);
  }

  function pickSlot(card: Extract<ThreadItem, { kind: "slots" }>, slot: AssistantSlot): void {
    const dateLabel = format(new Date(slot.datetime), "EEEE d MMMM");
    const timeLabel = format(new Date(slot.datetime), "HH:mm");
    const userLine = `${timeLabel} with ${slot.staffName} on ${dateLabel}`;

    // Add the user's selection as a message, then go directly to the
    // checkout handoff — no AI round-trip needed once a slot is chosen.
    setThread((prev) => [
      ...prev,
      { kind: "user", content: userLine, id: crypto.randomUUID() },
    ]);

    startTransition(async () => {
      const handoff = await assistantBookingHandoffUrl({
        serviceId: card.serviceId,
        slotDatetime: slot.datetime,
        staffId: slot.staffId,
      });
      setThread((prev) => [
        ...prev,
        {
          kind: "handoff",
          id: crypto.randomUUID(),
          serviceName: card.serviceName,
          slotDatetime: slot.datetime,
          staffName: slot.staffName,
          url: handoff.url,
        },
      ]);
    });
  }

  function reset(): void {
    setThread([]);
    setError(null);
    setDraft("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-olive/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Astrabody assistant"
    >
      <div
        className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-cream shadow-xl sm:h-[640px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 bg-olive px-4 py-3 text-cream">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <span className="font-serif text-[16px] font-medium tracking-tight">
              Astrabody Assistant
            </span>
          </div>
          <div className="flex items-center gap-2">
            {thread.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="text-[12px] tracking-snug text-cream/80 hover:text-cream"
              >
                Start over
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1 text-cream/80 hover:bg-white/10 hover:text-cream"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          {thread.length === 0 ? (
            <EmptyState onPick={(text) => send(text)} />
          ) : (
            <ul className="flex flex-col gap-3">
              {thread.map((item) => (
                <li key={item.id}>
                  <ThreadRow
                    item={item}
                    onPickSlot={(card, slot) => pickSlot(card, slot)}
                  />
                </li>
              ))}
              {pending && (
                <li>
                  <ThinkingBubble />
                </li>
              )}
            </ul>
          )}
        </div>

        {error && (
          <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2 border-t border-olive/10 bg-sand px-3 py-3"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your message…"
            className="min-w-0 flex-1 rounded-full border border-olive/15 bg-cream px-4 py-2 text-[14px] text-olive placeholder:text-olive-soft/70 focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={pending || !draft.trim()}
            className="flex size-11 items-center justify-center rounded-full bg-sage text-cream transition-transform active:scale-95 disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-6">
      <span className="flex size-12 items-center justify-center rounded-full bg-sage/10 text-[32px] leading-none text-sage">
        ✦
      </span>
      <div className="text-center">
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          How can I help you today?
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Ask me anything about your account.
        </p>
      </div>
      <ul className="mt-2 flex w-full flex-col gap-2">
        {STARTER_CHIPS.map((chip) => (
          <li key={chip}>
            <button
              type="button"
              onClick={() => onPick(chip)}
              className="flex min-h-[44px] w-full items-center justify-center rounded-full border border-sage/30 bg-cream px-4 text-[14px] text-olive hover:border-sage hover:bg-sage/5"
            >
              {chip}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadRow({
  item,
  onPickSlot,
}: {
  item: ThreadItem;
  onPickSlot: (
    card: Extract<ThreadItem, { kind: "slots" }>,
    slot: AssistantSlot
  ) => void;
}) {
  if (item.kind === "user") {
    return (
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-sage px-3 py-2 text-[14px] leading-snug text-cream">
        {item.content}
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-sand px-3 py-2 text-[14px] leading-snug text-olive">
        {item.content}
      </div>
    );
  }
  if (item.kind === "slots") {
    return (
      <SlotsCard card={item} onPick={(slot) => onPickSlot(item, slot)} />
    );
  }
  if (item.kind === "handoff") {
    return <HandoffCard handoff={item} />;
  }
  return null;
}

const WINDOW_HOURS: Record<
  "morning" | "afternoon" | "evening",
  [number, number]
> = {
  morning: [0, 12],
  afternoon: [12, 17],
  evening: [17, 24],
};

function filterByWindow(
  slots: AssistantSlot[],
  window?: "morning" | "afternoon" | "evening" | null
): AssistantSlot[] {
  if (!window) return slots;
  const [from, to] = WINDOW_HOURS[window];
  return slots.filter((s) => {
    const h = new Date(s.datetime).getHours();
    return h >= from && h < to;
  });
}

function SlotsCard({
  card,
  onPick,
}: {
  card: Extract<ThreadItem, { kind: "slots" }>;
  onPick: (slot: AssistantSlot) => void;
}) {
  const dateLabel = format(new Date(`${card.date}T00:00:00`), "EEEE d MMMM");
  const visible = filterByWindow(card.slots, card.timeWindow).slice(0, 8);

  return (
    <div className="rounded-2xl rounded-bl-sm bg-sand/70 p-3">
      <div className="text-[12px] tracking-snug text-olive">
        {card.serviceName} · {dateLabel}
        {card.timeWindow && (
          <span className="ml-1 capitalize text-olive/60">
            · {card.timeWindow}
          </span>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="mt-2 text-[13px] text-olive/60">
          No {card.timeWindow ?? ""} slots available — try a different day or
          time.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {visible.map((slot) => (
            <li key={slot.datetime}>
              <button
                type="button"
                onClick={() => onPick(slot)}
                className="flex w-full items-center justify-between rounded-full border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive hover:border-sage/40 hover:bg-sage/5"
              >
                <span>{format(new Date(slot.datetime), "HH:mm")}</span>
                <span className="text-olive-soft">{slot.staffName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HandoffCard({
  handoff,
}: {
  handoff: Extract<ThreadItem, { kind: "handoff" }>;
}) {
  const dt = new Date(handoff.slotDatetime);
  return (
    <div className="rounded-2xl border border-sage/30 bg-sage/5 p-4">
      <div className="flex items-center gap-1.5 text-[12px] tracking-snug text-sage-deep">
        <Sparkles className="size-3.5" />
        Almost there
      </div>
      <p className="mt-1 text-[14px] font-medium text-olive">
        {handoff.serviceName} · {format(dt, "EEE d MMM")} ·{" "}
        {format(dt, "HH:mm")}
      </p>
      <p className="text-[12px] tracking-snug text-olive-soft">
        With {handoff.staffName}
      </p>
      <Link
        href={handoff.url}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-sage px-4 py-2 text-[13px] font-medium text-cream hover:bg-sage-deep"
      >
        Continue to checkout →
      </Link>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div
      className={cn(
        "flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-sand px-3 py-2"
      )}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:300ms]" />
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function threadToMessages(thread: ThreadItem[]): ChatMessage[] {
  return thread
    .filter((t) => t.kind === "user" || t.kind === "assistant")
    .map((t) => ({
      role: t.kind === "user" ? ("user" as const) : ("assistant" as const),
      content: (t as { content: string }).content,
    }));
}
