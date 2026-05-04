"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  describeSegment,
  type SegmentQuery,
} from "@/lib/email/segments-shared";
import {
  dismissCommsProposal,
  generateCommsDraft,
  getCommsRecipientCount,
  sendCommsProposal,
} from "@/lib/comms/proposal-actions";

export interface CommsProposalBarProps {
  proposalId: string;
  triggerSummary: string;
  defaultSegment: SegmentQuery;
  /** Optional initial draft when the AI has already responded. */
  initialDraft?: { subject: string | null; bodyMd: string | null };
  /** Service options for the segment picker (optional). */
  services?: Array<{ id: string; name: string }>;
  /** Called after successful send / dismiss so the parent can hide the bar. */
  onResolved?: () => void;
}

export function CommsProposalBar({
  proposalId,
  triggerSummary,
  defaultSegment,
  initialDraft,
  services,
  onResolved,
}: CommsProposalBarProps) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  if (hidden) return null;

  return (
    <>
      <div className="mt-3 rounded-xl border border-sage/20 bg-sage/5 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0 text-sage" />
            <div>
              <div className="text-[14px] font-medium text-olive">
                Want to let your clients know?
              </div>
              <p className="text-[12px] tracking-snug text-olive-soft">
                {triggerSummary}
              </p>
              <p className="text-[11px] tracking-snug text-olive-soft">
                Draft email ready · {describeSegment(defaultSegment)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="min-h-[44px] min-w-[44px]"
            >
              Preview & send
            </Button>
            <DismissButton
              proposalId={proposalId}
              onDone={() => {
                setHidden(true);
                onResolved?.();
              }}
            />
          </div>
        </div>
      </div>

      {open && (
        <CommsSheet
          proposalId={proposalId}
          triggerSummary={triggerSummary}
          defaultSegment={defaultSegment}
          initialDraft={initialDraft}
          services={services}
          onClose={() => setOpen(false)}
          onSent={() => {
            setHidden(true);
            setOpen(false);
            onResolved?.();
          }}
        />
      )}
    </>
  );
}

function DismissButton({
  proposalId,
  onDone,
}: {
  proposalId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await dismissCommsProposal(proposalId);
          onDone();
        })
      }
      className="min-h-[44px] min-w-[44px]"
    >
      {isPending ? "Dismissing…" : "Dismiss"}
    </Button>
  );
}

// ============================================================
// Sheet
// ============================================================

function CommsSheet({
  proposalId,
  triggerSummary,
  defaultSegment,
  initialDraft,
  services,
  onClose,
  onSent,
}: {
  proposalId: string;
  triggerSummary: string;
  defaultSegment: SegmentQuery;
  initialDraft?: { subject: string | null; bodyMd: string | null };
  services?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [segment, setSegment] = useState<SegmentQuery>(defaultSegment);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [bodyMd, setBodyMd] = useState(initialDraft?.bodyMd ?? "");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isLoadingDraft, setIsLoadingDraft] = useState(
    !initialDraft?.bodyMd
  );
  const draftFetched = useRef(false);

  // Pull recipient count live whenever the segment changes (or sheet opens).
  useEffect(() => {
    let cancelled = false;
    setRecipientCount(null);
    void getCommsRecipientCount(segment).then((res) => {
      if (cancelled) return;
      if (res.ok) setRecipientCount(res.count);
    });
    return () => {
      cancelled = true;
    };
  }, [segment]);

  // Load the AI draft once if it isn't already on the proposal row.
  useEffect(() => {
    if (draftFetched.current) return;
    if (initialDraft?.bodyMd) {
      setIsLoadingDraft(false);
      return;
    }
    draftFetched.current = true;
    void generateCommsDraft(proposalId).then((res) => {
      if (res.ok) {
        if (!subject) setSubject(res.subject);
        if (!bodyMd) setBodyMd(res.bodyMd);
      }
      setIsLoadingDraft(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const send = (intent: "now" | "schedule"): void => {
    if (!subject.trim() || !bodyMd.trim()) {
      setError("Subject and body are required.");
      return;
    }
    if (intent === "schedule" && !scheduledAt) {
      setError("Pick a date and time.");
      return;
    }
    startSend(async () => {
      setError(null);
      const res = await sendCommsProposal({
        proposalId,
        subject,
        bodyMd,
        segment,
        scheduleAt:
          intent === "schedule" ? new Date(scheduledAt).toISOString() : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSent();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-olive/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-cream shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-olive/10 px-5 py-3">
          <div>
            <h3 className="font-serif text-[20px] font-medium text-olive">
              Email clients
            </h3>
            <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
              {triggerSummary}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            <SegmentPicker
              value={segment}
              onChange={setSegment}
              services={services}
            />

            <div className="rounded-lg bg-sand/30 px-3 py-2 text-[12px] tracking-snug text-olive-soft">
              {recipientCount === null
                ? "Counting recipients…"
                : recipientCount === 1
                  ? "1 client will receive this email."
                  : `${recipientCount.toLocaleString("en-GB")} clients will receive this email.`}
            </div>

            {isLoadingDraft && (
              <div className="rounded-lg bg-sand/30 px-3 py-2 text-[12px] tracking-snug text-olive-soft">
                Drafting…
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                Subject
              </span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] tracking-snug text-olive-soft">
                Body (markdown)
              </span>
              <textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                rows={10}
                className="resize-y rounded-lg border border-olive/15 bg-cream px-3 py-2 font-mono text-[13px] leading-snug text-olive"
              />
            </label>

            <details className="rounded-lg bg-sand/20 px-3 py-2">
              <summary className="cursor-pointer text-[12px] tracking-snug text-olive-soft">
                Schedule for later
              </summary>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2 w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
              />
            </details>

            <p className="text-[11px] tracking-snug text-olive-soft">
              Clients who have unsubscribed will not receive this.
            </p>

            {error && (
              <p className="text-[13px] text-destructive">{error}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-olive/10 px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            disabled={isSending}
            onClick={onClose}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          {scheduledAt && (
            <Button
              variant="ghost"
              disabled={isSending}
              onClick={() => send("schedule")}
              className="min-h-[44px]"
            >
              Schedule
            </Button>
          )}
          <Button
            disabled={isSending}
            onClick={() => send("now")}
            className="min-h-[44px]"
          >
            {isSending ? "Sending…" : "Send now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SegmentPicker({
  value,
  onChange,
  services,
}: {
  value: SegmentQuery;
  onChange: (s: SegmentQuery) => void;
  services?: Array<{ id: string; name: string }>;
}) {
  const isService = value.type === "service";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] tracking-snug text-olive-soft">
        Send to
      </span>
      <div className="flex flex-wrap gap-2">
        <Pill
          active={value.type === "all"}
          onClick={() => onChange({ type: "all" })}
        >
          All active clients
        </Pill>
        <Pill
          active={value.type === "tier"}
          onClick={() =>
            onChange({ type: "tier", params: { min: "insider" } })
          }
        >
          Insider+ tier
        </Pill>
        {services && services.length > 0 && (
          <Pill
            active={isService}
            onClick={() =>
              onChange({
                type: "service",
                params: { serviceId: services[0].id },
              })
            }
          >
            Booked a service
          </Pill>
        )}
      </div>
      {isService && services && services.length > 0 && (
        <select
          value={value.params.serviceId}
          onChange={(e) =>
            onChange({
              type: "service",
              params: { serviceId: e.target.value },
            })
          }
          className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full border border-sage bg-sage px-3 py-1.5 text-[12px] font-medium text-cream"
          : "rounded-full border border-olive/15 bg-cream px-3 py-1.5 text-[12px] text-olive hover:border-sage/40 hover:bg-sage/5"
      }
    >
      {children}
    </button>
  );
}
