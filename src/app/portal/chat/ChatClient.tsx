"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import {
  markThreadRead,
  sendClientMessage,
  type ChatMessageRow,
} from "./actions";
import { cn } from "@/lib/utils";

interface Props {
  threadId: string;
  initialMessages: ChatMessageRow[];
  staffActiveAtLoad: boolean;
}

/**
 * Apple-canon chat surface. Sticky header, scrollable thread, sticky
 * composer above the BottomNav.
 *
 * Realtime: subscribes to postgres_changes INSERT on chat_messages
 * filtered by thread_id. New rows from staff (or any other source) are
 * appended in order. Optimistic client inserts are de-duplicated against
 * the realtime echo by id.
 */
export function ChatClient({ threadId, initialMessages, staffActiveAtLoad }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map(toDisplay)
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Mark every staff/bot message as read on first paint.
  useEffect(() => {
    void markThreadRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessageRow;
          setMessages((current) => {
            if (current.some((m) => m.id === incoming.id)) return current;
            const merged = [...current, toDisplay(incoming)];
            merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return merged;
          });
          if (incoming.author_type === "staff" || incoming.author_type === "bot") {
            void markThreadRead(threadId);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  // Auto-scroll on new message.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: DisplayMessage = {
      id: tempId,
      thread_id: threadId,
      tenant_id: "",
      sender_client_id: null,
      sender_staff_id: null,
      author_type: "client",
      body,
      attachments: null,
      delivered_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
      primary_channel: "in_app_push",
      pending: true,
    };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    setSending(true);

    const result = await sendClientMessage({ threadId, body });
    setSending(false);
    if (!result.ok) {
      // Mark optimistic as failed (very minimal V1 UX).
      setMessages((m) =>
        m.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x))
      );
      return;
    }
    // Replace temp with the real row (realtime may also broadcast the same
    // id; the dedup by id keeps things tidy).
    setMessages((m) =>
      m.map((x) => (x.id === tempId ? toDisplay(result.message) : x))
    );
  }

  // Identify the last staff message id (for the receipt indicator).
  const lastStaffMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.author_type === "staff" || m.author_type === "bot") return m.id;
    }
    return null;
  }, [messages]);

  return (
    <>
      <Header staffActive={staffActiveAtLoad} />

      <div className="px-4 pt-3 pb-[160px]">
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const showDayBreak = prev
            ? !sameLondonDay(new Date(prev.created_at), new Date(msg.created_at))
            : true;
          return (
            <div key={msg.id}>
              {showDayBreak && (
                <DayBreak when={new Date(msg.created_at)} />
              )}
              <BubbleRow
                msg={msg}
                isLastStaff={msg.id === lastStaffMsgId}
              />
            </div>
          );
        })}
        <div ref={scrollAnchorRef} className="h-1" aria-hidden />
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={handleSend}
        sending={sending}
      />
    </>
  );
}

function Header({ staffActive }: { staffActive: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex flex-col items-center justify-center border-b-[0.5px] border-hairline bg-white px-4 py-3">
      <p className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Astrabody
      </p>
      {staffActive ? (
        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          <span
            className="h-1.5 w-1.5 rounded-full bg-sage"
            aria-hidden
          />
          Active now
        </span>
      ) : (
        <span className="mt-1 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Usually replies in under an hour
        </span>
      )}
    </header>
  );
}

function DayBreak({ when }: { when: Date }) {
  const label = when
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/London",
    })
    .toUpperCase();
  return (
    <div className="my-5 flex justify-center">
      <span className="font-serif text-[11px] font-medium uppercase tracking-label-caps text-olive-faint">
        {label}
      </span>
    </div>
  );
}

function BubbleRow({
  msg,
  isLastStaff,
}: {
  msg: DisplayMessage;
  isLastStaff: boolean;
}) {
  const isClient = msg.author_type === "client";
  const isBot = msg.author_type === "bot";

  if (isClient) {
    return (
      <div className="mt-2 flex justify-end">
        <div className="max-w-[78%]">
          <div
            className={cn(
              "rounded-lg bg-sage-deep px-4 py-2.5 text-[14px] tracking-snug text-cream",
              msg.pending && "opacity-70",
              msg.failed && "ring-1 ring-destructive"
            )}
          >
            {msg.body}
          </div>
        </div>
      </div>
    );
  }

  // Staff or bot — left aligned.
  return (
    <div className="mt-2 flex justify-start">
      <div className="max-w-[78%]">
        {isBot && (
          <p className="mb-1 ml-1 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Astrabody assistant
          </p>
        )}
        <div
          className={cn(
            "rounded-lg px-4 py-2.5 text-[14px] tracking-snug text-olive",
            isBot
              ? "bg-cream-deep"
              : "bg-white border-[0.5px] border-hairline"
          )}
        >
          {msg.body}
        </div>
        {/* Read receipts on the LAST staff/bot message only, per spec. */}
        {isLastStaff && (msg.delivered_at || msg.read_at) && (
          <div className="mt-1 flex justify-end pr-1">
            {msg.read_at ? (
              <span className="text-[10px] text-sage" aria-label="read">
                ✓✓
              </span>
            ) : (
              <span className="text-[10px] text-olive-faint" aria-label="delivered">
                ✓
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  sending: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[86px] z-50 flex justify-center">
      <div className="w-full max-w-[480px] border-t-[0.5px] border-hairline bg-white">
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 px-4 py-3"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Type a message"
            className="h-11 flex-1 rounded-full bg-cream-deep px-4 text-[14px] text-olive placeholder:text-olive-soft"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!value.trim() || sending}
            aria-label="Send"
            className="ax-tap flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sage-deep text-cream transition-all duration-200 ease-ios disabled:opacity-50"
          >
            <Send size={16} strokeWidth={1.8} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- helpers ----------

interface DisplayMessage extends ChatMessageRow {
  pending?: boolean;
  failed?: boolean;
}

function toDisplay(row: ChatMessageRow): DisplayMessage {
  return { ...row };
}

function sameLondonDay(a: Date, b: Date): boolean {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return fmt(a) === fmt(b);
}
