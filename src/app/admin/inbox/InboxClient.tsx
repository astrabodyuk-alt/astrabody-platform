"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDistanceToNow,
  differenceInDays,
  format,
} from "date-fns";
import { sendStaffMessage, markThreadReadByStaff } from "./actions";
import type { ThreadRow, MessageRow } from "./page";

export function InboxClient({
  threads,
  activeThreadId,
  initialMessages,
}: {
  threads: ThreadRow[];
  activeThreadId: string | null;
  initialMessages: MessageRow[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Reset state when the active thread changes.
  useEffect(() => {
    setMessages(initialMessages);
    setDraft("");
    setError(null);
  }, [activeThreadId, initialMessages]);

  // Mark thread read on open + auto-scroll to bottom.
  useEffect(() => {
    if (!activeThreadId) return;
    void markThreadReadByStaff(activeThreadId);
    scrollAnchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [activeThreadId]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeThreadId) return;
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendStaffMessage({ threadId: activeThreadId, body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    router.refresh();
  }

  return (
    <div className="grid h-[calc(100vh-200px)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Thread list */}
      <Card className="flex h-full flex-col overflow-y-auto p-2">
        {threads.length === 0 ? (
          <p className="p-4 text-[13px] tracking-snug text-olive-soft">
            No threads yet. They&rsquo;ll appear when clients message.
          </p>
        ) : (
          <ul className="flex flex-col">
            {threads.map((t) => (
              <ThreadRowItem
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Conversation pane */}
      <Card className="flex h-full flex-col overflow-hidden">
        {!activeThreadId ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-[13px] tracking-snug text-olive-soft">
              Pick a conversation on the left.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map((m, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const showDay = prev
                  ? !sameLondonDay(new Date(prev.created_at), new Date(m.created_at))
                  : true;
                return (
                  <div key={m.id}>
                    {showDay && <DayBreak when={new Date(m.created_at)} />}
                    <Bubble msg={m} />
                  </div>
                );
              })}
              <div ref={scrollAnchorRef} className="h-1" aria-hidden />
            </div>
            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t-[0.5px] border-hairline px-3 py-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Reply"
                className="h-11 flex-1 rounded-full bg-cream-deep px-4 text-[14px] text-olive placeholder:text-olive-soft"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="ax-tap flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sage-deep text-cream transition-all duration-200 ease-ios disabled:opacity-50"
              >
                <Send size={16} strokeWidth={1.8} />
              </button>
            </form>
            {error && (
              <p className="px-3 py-1 text-[12px] text-destructive">{error}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function ThreadRowItem({
  thread,
  isActive,
}: {
  thread: ThreadRow;
  isActive: boolean;
}) {
  const client = pickFirst<{ full_name: string | null; email: string | null }>(thread.clients);
  const name = client?.full_name?.trim() || client?.email || "—";
  const unread = (thread.unread_count_staff as number | null) ?? 0;
  const when = thread.last_message_at ? relativeShort(thread.last_message_at) : "";

  return (
    <li>
      <Link
        href={`/admin/inbox?thread=${thread.id}`}
        className={cn(
          "block rounded-md px-3 py-3 transition-colors duration-200 ease-ios",
          isActive
            ? "bg-cream-deep"
            : "hover:bg-cream-deep/50 focus-visible:bg-cream-deep/50",
          "focus-visible:outline-none"
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-medium tracking-snug text-olive">
            {name}
          </span>
          <span className="flex-shrink-0 text-[11px] tabular-nums text-olive-faint">
            {when}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="flex-1 truncate text-[12px] tracking-snug text-olive-soft">
            {thread.last_message_preview ?? "—"}
          </p>
          {unread > 0 && (
            <span className="flex-shrink-0 rounded-full bg-sage px-2 py-0.5 text-[11px] font-medium tabular-nums text-cream">
              {unread}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function Bubble({ msg }: { msg: MessageRow }) {
  // On the staff side, OUR messages (author_type='staff') are right-aligned;
  // client + bot are left-aligned. (Mirror of /portal/chat.)
  const isStaff = msg.author_type === "staff";
  const isBot = msg.author_type === "bot";

  if (isStaff) {
    return (
      <div className="mt-2 flex justify-end">
        <div className="max-w-[78%] rounded-lg bg-sage-deep px-4 py-2.5 text-[14px] tracking-snug text-cream">
          {msg.body}
        </div>
      </div>
    );
  }
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
            isBot ? "bg-cream-deep" : "border-[0.5px] border-hairline bg-white"
          )}
        >
          {msg.body}
        </div>
      </div>
    </div>
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

function relativeShort(iso: string): string {
  const d = new Date(iso);
  const days = differenceInDays(new Date(), d);
  if (days < 1) return formatDistanceToNow(d, { addSuffix: false });
  if (days < 7) return format(d, "EEE");
  return format(d, "d MMM");
}

function sameLondonDay(a: Date, b: Date): boolean {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return fmt(a) === fmt(b);
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
