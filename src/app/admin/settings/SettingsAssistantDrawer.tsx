"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applySettingsChanges,
  interpretSettingsRequest,
  rejectSettingsPlan,
  type AssistantContext,
  type AssistantPlan,
} from "@/lib/scheduling/ai-assistant";

type Bubble =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      logId: string;
      plan: AssistantPlan;
      status: "pending" | "applied" | "rejected" | "info";
    };

export function SettingsAssistantDrawer({
  context,
}: {
  context: AssistantContext;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [bubbles, open]);

  const send = (): void => {
    const message = draft.trim();
    if (!message || isPending) return;
    const userBubble: Bubble = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
    };
    setBubbles((b) => [...b, userBubble]);
    setDraft("");
    setError(null);
    startTransition(async () => {
      const res = await interpretSettingsRequest({ message, context });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const status: "info" | "pending" =
        res.plan.changes.length === 0 ? "info" : "pending";
      setBubbles((b) => [
        ...b,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          logId: res.logId,
          plan: res.plan,
          status,
        },
      ]);
    });
  };

  const apply = (logId: string): void => {
    startTransition(async () => {
      const res = await applySettingsChanges(logId);
      setBubbles((b) =>
        b.map((bubble) =>
          bubble.role === "assistant" && bubble.logId === logId
            ? {
                ...bubble,
                status: res.ok ? "applied" : "pending",
              }
            : bubble
        )
      );
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  const cancel = (logId: string): void => {
    startTransition(async () => {
      await rejectSettingsPlan(logId);
      setBubbles((b) =>
        b.map((bubble) =>
          bubble.role === "assistant" && bubble.logId === logId
            ? { ...bubble, status: "rejected" }
            : bubble
        )
      );
    });
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-1.5 rounded-full bg-sage px-4 text-[14px] font-medium text-cream shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] sm:right-8"
        >
          <Sparkles className="size-4" />
          Ask AI
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-olive/10 bg-cream shadow-xl sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-olive/10 px-4 py-3">
            <div>
              <div className="flex items-center gap-1.5 font-serif text-[18px] font-medium text-olive">
                <Sparkles className="size-4 text-sage" />
                Settings assistant
              </div>
              <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                Describe any change and I&apos;ll preview it before applying.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4"
          >
            {bubbles.length === 0 && (
              <div className="rounded-lg bg-sand/30 p-3 text-[13px] tracking-snug text-olive-soft">
                Try: &ldquo;Tove is off 15–22 May for annual leave.&rdquo;
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {bubbles.map((b) => (
                <li key={b.id}>
                  {b.role === "user" ? (
                    <UserBubble text={b.text} />
                  ) : (
                    <AssistantBubble
                      plan={b.plan}
                      status={b.status}
                      onApply={() => apply(b.logId)}
                      onCancel={() => cancel(b.logId)}
                      busy={isPending}
                    />
                  )}
                </li>
              ))}
              {isPending && bubbles[bubbles.length - 1]?.role === "user" && (
                <li>
                  <ThinkingDots />
                </li>
              )}
            </ul>
          </div>

          {error && (
            <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-olive/10 px-3 py-3"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Tove is off from 15 to 22 May"
              className="min-w-0 flex-1 rounded-full border border-olive/15 bg-cream px-4 py-2 text-[14px] text-olive placeholder:text-olive-soft/70 focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={isPending || !draft.trim()}
              className="flex size-11 items-center justify-center rounded-full bg-sage text-cream transition-transform active:scale-95 disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-sage px-3 py-2 text-[14px] leading-snug text-cream">
      {text}
    </div>
  );
}

function AssistantBubble({
  plan,
  status,
  onApply,
  onCancel,
  busy,
}: {
  plan: AssistantPlan;
  status: "pending" | "applied" | "rejected" | "info";
  onApply: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  if (status === "info" || plan.changes.length === 0) {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-sand/40 px-3 py-2 text-[14px] leading-snug text-olive">
        {plan.clarification_needed ?? plan.summary}
      </div>
    );
  }

  return (
    <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-olive/10 bg-cream p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] tracking-snug text-sage">
        <Sparkles className="size-3.5" />
        Preview of changes
      </div>
      <p className="text-[14px] font-medium leading-snug text-olive">
        {plan.summary}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {plan.changes.map((c, i) => (
          <li
            key={i}
            className="rounded-lg bg-sand/30 px-2.5 py-1.5 text-[12px] tracking-snug text-olive"
          >
            {c.description}
            {c.type === "update_service_price" && (
              <div className="mt-1 text-[11px] text-terracotta">
                Affects all future bookings. Existing confirmed bookings keep
                their original price.
              </div>
            )}
          </li>
        ))}
      </ul>

      {status === "pending" && (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="text-[13px]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onApply}
            disabled={busy}
            className="text-[13px]"
          >
            Apply
          </Button>
        </div>
      )}
      {status === "applied" && (
        <div className="mt-2 text-[12px] tracking-snug text-sage-deep">
          Done.
        </div>
      )}
      {status === "rejected" && (
        <div className="mt-2 text-[12px] tracking-snug text-olive-soft">
          Cancelled — nothing changed.
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div
      className={cn(
        "flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-sand/40 px-3 py-2"
      )}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-sage [animation-delay:300ms]" />
    </div>
  );
}
