"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Sparkles, Users } from "lucide-react";
import { ControlledSendIcon } from "@/components/portal/icons/AnimatedIcons";
import { cn } from "@/lib/utils";
import { LiquidCard } from "@/components/ui/card";
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

export function AIChatClient() {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread, pending]);

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
    // Trigger the fly-off animation, reset after 600ms
    setJustSent(true);
    setTimeout(() => setJustSent(false), 600);
    const messages = pushUser(text);
    runChat(messages);
  }

  function runChat(messages: ChatMessage[]): void {
    startTransition(async () => {
      const res = await portalAssistantChat({ messages });
      if (!res.ok) { setError(res.error); return; }
      await applyReply(res.reply);
    });
  }

  async function applyReply(reply: AssistantReply): Promise<void> {
    setThread((prev) => [
      ...prev,
      { kind: "assistant", content: reply.message, id: crypto.randomUUID() },
    ]);
    if (reply.action) await dispatchAction(reply.action);
  }

  async function dispatchAction(action: AssistantAction): Promise<void> {
    if (!action) return;
    if (action.type === "SHOW_SLOTS") {
      const res = await assistantFetchSlots({ serviceId: action.serviceId, date: action.date });
      if (!res.ok) { appendAssistant(`Sorry — ${res.error}`); return; }
      if (res.slots.length === 0) {
        appendAssistant(`Nothing free for ${res.serviceName} on ${format(new Date(`${action.date}T00:00:00`), "EEEE d MMMM")}. Want me to try another day?`);
        return;
      }
      setThread((prev) => [...prev, {
        kind: "slots", id: crypto.randomUUID(),
        serviceId: action.serviceId, serviceName: res.serviceName,
        date: action.date, slots: res.slots,
        timeWindow: action.type === "SHOW_SLOTS" ? (action.timeWindow ?? null) : null,
      }]);
      return;
    }
    if (action.type === "CONFIRM_BOOKING") {
      const handoff = await assistantBookingHandoffUrl({
        serviceId: action.serviceId, slotDatetime: action.slotDatetime, staffId: action.staffId ?? null,
      });
      let staffName = "the team";
      const slotsCard = thread.find((t) => t.kind === "slots" && t.serviceId === action.serviceId);
      if (slotsCard && slotsCard.kind === "slots") {
        const match = slotsCard.slots.find((s) => s.datetime === action.slotDatetime);
        if (match) staffName = match.staffName;
      }
      const serviceName = slotsCard?.kind === "slots" ? slotsCard.serviceName : "your session";
      setThread((prev) => [...prev, {
        kind: "handoff", id: crypto.randomUUID(),
        serviceName, slotDatetime: action.slotDatetime, staffName, url: handoff.url,
      }]);
    }
  }

  function appendAssistant(content: string): void {
    setThread((prev) => [...prev, { kind: "assistant", content, id: crypto.randomUUID() }]);
  }

  function pickSlot(card: Extract<ThreadItem, { kind: "slots" }>, slot: AssistantSlot): void {
    const dateLabel = format(new Date(slot.datetime), "EEEE d MMMM");
    const timeLabel = format(new Date(slot.datetime), "HH:mm");
    setThread((prev) => [...prev, {
      kind: "user", content: `${timeLabel} with ${slot.staffName} on ${dateLabel}`, id: crypto.randomUUID(),
    }]);
    startTransition(async () => {
      const handoff = await assistantBookingHandoffUrl({
        serviceId: card.serviceId, slotDatetime: slot.datetime, staffId: slot.staffId,
      });
      setThread((prev) => [...prev, {
        kind: "handoff", id: crypto.randomUUID(),
        serviceName: card.serviceName, slotDatetime: slot.datetime, staffName: slot.staffName, url: handoff.url,
      }]);
    });
  }

  return (
    <div className="flex h-[calc(100dvh-56px-86px)] flex-col bg-cream">
      {/* ── Hero header (dark sage gradient, matches home card) ── */}
      <div
        className="relative flex-shrink-0 overflow-hidden px-4 pb-4 pt-5"
        style={{
          background:
            "linear-gradient(135deg, #BBC4AA 0%, #758564 45%, #3E4D2E 100%)",
        }}
      >
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 70% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)",
          }}
        />

        {/* Top row: sparkle icon + Team link */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 items-center justify-center rounded-full text-[18px]"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
            >
              ✦
            </span>
            <div>
              <p className="text-[15px] font-medium tracking-snug text-white">
                Astrabody Assistant
              </p>
              <p className="text-[11px] text-white/60">Always here · replies instantly</p>
            </div>
          </div>
          <Link
            href="/portal/chat/team"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-white/80 transition-colors hover:text-white"
            style={{
              background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <Users size={12} strokeWidth={1.6} />
            Team
          </Link>
        </div>

        {/* Glassmorphism prompt line */}
        {thread.length === 0 && (
          <div
            className="relative mt-4 rounded-2xl px-4 py-3"
            style={{
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            <h2 className="font-serif text-[22px] font-medium leading-tight tracking-tight text-white">
              How can I help you today?
            </h2>
            <p className="mt-0.5 text-[13px] text-white/60">
              Ask me anything about your account.
            </p>
          </div>
        )}
      </div>

      {/* Thread + Input wrapped in LiquidCard glass effect */}
      <LiquidCard
        wrapperClassName="mx-3 mb-3 mt-2 flex-1 overflow-hidden flex flex-col min-h-0"
        className="flex-1 overflow-hidden border-white/10 p-0 flex flex-col min-h-0"
      >
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ minHeight: 0, flex: 1 }}>
          {thread.length === 0 ? (
            <StarterChips onPick={(text) => send(text)} />
          ) : (
            <ul className="flex flex-col gap-3">
              {thread.map((item) => (
                <li key={item.id}>
                  <ThreadRow item={item} onPickSlot={(card, slot) => pickSlot(card, slot)} />
                </li>
              ))}
              {pending && <li><ThinkingBubble /></li>}
            </ul>
          )}
        </div>

        {error && (
          <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(draft); }}
          className="flex items-center gap-2 border-t border-white/10 px-3 py-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask me anything…"
            className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-[14px] text-olive placeholder:text-olive/50 focus:border-sage/60 focus:outline-none focus:ring-1 focus:ring-sage/40 backdrop-blur-sm"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={pending || !draft.trim()}
            className="flex size-11 items-center justify-center rounded-full bg-sage text-cream transition-transform active:scale-95 disabled:opacity-50"
          >
            <ControlledSendIcon sent={justSent} size={18} color="currentColor" />
          </button>
        </form>
      </LiquidCard>
    </div>
  );
}

function StarterChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <ul className="flex flex-col gap-2 pt-2">
      {STARTER_CHIPS.map((chip) => (
        <li key={chip}>
          <button
            type="button"
            onClick={() => onPick(chip)}
            className="flex min-h-[50px] w-full items-center justify-between rounded-2xl border border-olive/10 bg-white px-4 text-[14px] text-olive shadow-sm active:scale-[0.98] active:bg-sage/5 transition-transform"
          >
            <span>{chip}</span>
            <span className="text-sage/60 text-[16px]">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ThreadRow({ item, onPickSlot }: {
  item: ThreadItem;
  onPickSlot: (card: Extract<ThreadItem, { kind: "slots" }>, slot: AssistantSlot) => void;
}) {
  if (item.kind === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-sage px-3.5 py-2.5 text-[14px] leading-snug text-cream">
        {item.content}
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="flex items-start gap-2 max-w-[90%]">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sage/10 text-[12px]">✦</span>
        <div className="rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-[14px] leading-snug text-olive shadow-sm">
          {item.content}
        </div>
      </div>
    );
  }
  if (item.kind === "slots") return <SlotsCard card={item} onPick={(slot) => onPickSlot(item, slot)} />;
  if (item.kind === "handoff") return <HandoffCard handoff={item} />;
  return null;
}

const WINDOW_HOURS: Record<"morning" | "afternoon" | "evening", [number, number]> = {
  morning: [0, 12], afternoon: [12, 17], evening: [17, 24],
};

function SlotsCard({ card, onPick }: { card: Extract<ThreadItem, { kind: "slots" }>; onPick: (slot: AssistantSlot) => void }) {
  const dateLabel = format(new Date(`${card.date}T00:00:00`), "EEEE d MMMM");
  const visible = card.timeWindow
    ? card.slots.filter((s) => { const h = new Date(s.datetime).getHours(); const [f, t] = WINDOW_HOURS[card.timeWindow!]; return h >= f && h < t; }).slice(0, 8)
    : card.slots.slice(0, 8);
  return (
    <div className="flex items-start gap-2 max-w-[90%]">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sage/10 text-[12px]">✦</span>
      <div className="flex-1 rounded-2xl rounded-bl-sm bg-white p-3 shadow-sm">
        <p className="text-[12px] text-olive-soft">{card.serviceName} · {dateLabel}</p>
        {visible.length === 0 ? (
          <p className="mt-2 text-[13px] text-olive/60">No slots available — try another day.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible.map((slot) => (
              <li key={slot.datetime}>
                <button type="button" onClick={() => onPick(slot)}
                  className="flex w-full items-center justify-between rounded-full border border-olive/10 bg-cream px-3 py-2 text-[13px] text-olive active:bg-sage/5">
                  <span className="font-medium">{format(new Date(slot.datetime), "HH:mm")}</span>
                  <span className="text-olive-soft">{slot.staffName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HandoffCard({ handoff }: { handoff: Extract<ThreadItem, { kind: "handoff" }> }) {
  const dt = new Date(handoff.slotDatetime);
  return (
    <div className="flex items-start gap-2 max-w-[90%]">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sage/10 text-[12px]">✦</span>
      <div className="flex-1 rounded-2xl rounded-bl-sm border border-sage/25 bg-sage/5 p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-[12px] text-sage">
          <Sparkles size={12} /> Almost there
        </div>
        <p className="mt-1 text-[14px] font-medium text-olive">
          {handoff.serviceName} · {format(dt, "EEE d MMM")} · {format(dt, "HH:mm")}
        </p>
        <p className="text-[12px] text-olive-soft">With {handoff.staffName}</p>
        <Link href={handoff.url}
          className="mt-3 inline-flex items-center justify-center rounded-full bg-sage px-4 py-2 text-[13px] font-medium text-cream">
          Continue to checkout →
        </Link>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage/10 text-[12px]">✦</span>
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-3 shadow-sm">
        <span className={cn("size-1.5 animate-pulse rounded-full bg-sage")} style={{ animationDelay: "0ms" }} />
        <span className={cn("size-1.5 animate-pulse rounded-full bg-sage")} style={{ animationDelay: "150ms" }} />
        <span className={cn("size-1.5 animate-pulse rounded-full bg-sage")} style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function threadToMessages(thread: ThreadItem[]): ChatMessage[] {
  return thread
    .filter((t) => t.kind === "user" || t.kind === "assistant")
    .map((t) => ({ role: t.kind === "user" ? ("user" as const) : ("assistant" as const), content: (t as { content: string }).content }));
}
