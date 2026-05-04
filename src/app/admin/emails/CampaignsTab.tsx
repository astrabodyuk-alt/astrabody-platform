"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeSegment, type SegmentQuery } from "@/lib/email/segments-shared";
import { aiAssistCopy, getSegmentCount, saveOrSendCampaign } from "./actions";

interface Broadcast {
  id: string;
  name: string;
  subject: string;
  body_md: string;
  segment_query: unknown;
  scheduled_at: string | null;
  sent_count: number | null;
  status: string;
  created_at: string;
  sent_at: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
}

export function CampaignsTab({
  broadcasts,
  services,
}: {
  broadcasts: Broadcast[];
  services: ServiceOption[];
}) {
  const [composing, setComposing] = useState<Broadcast | "new" | null>(null);

  if (composing) {
    return (
      <CampaignComposer
        initial={composing === "new" ? null : composing}
        services={services}
        onClose={() => setComposing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] tracking-snug text-olive-soft">
          Manual broadcasts to a segment of your client list.
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setComposing("new")}
        >
          + New campaign
        </Button>
      </div>

      {broadcasts.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No campaigns yet. Hit &ldquo;New campaign&rdquo; to draft one.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {broadcasts.map((b) => (
            <li key={b.id}>
              <Card
                interactive
                role="button"
                tabIndex={0}
                onClick={() => setComposing(b)}
                className="flex items-baseline justify-between gap-3 p-4"
              >
                <div className="flex-1">
                  <p className="text-[14px] font-medium tracking-snug text-olive">
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                    {b.subject}
                    {" · "}
                    {describeSegment(asSegment(b.segment_query))}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={b.status} />
                  {b.status === "sent" && (
                    <span className="text-[11px] tabular-nums tracking-snug text-olive-soft">
                      {b.sent_count ?? 0} sent
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    draft: { bg: "rgba(62,62,49,0.06)", fg: "rgba(62,62,49,0.62)" },
    scheduled: { bg: "rgba(184,148,90,0.10)", fg: "#B8945A" },
    sending: { bg: "rgba(117,133,100,0.10)", fg: "#5C6B4E" },
    sent: { bg: "rgba(117,133,100,0.16)", fg: "#5C6B4E" },
    failed: { bg: "rgba(212,91,91,0.10)", fg: "#D45B5B" },
  };
  const { bg, fg } = palette[status] ?? palette.draft;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

function asSegment(value: unknown): SegmentQuery {
  if (value && typeof value === "object" && "type" in value) {
    return value as SegmentQuery;
  }
  return { type: "all" };
}

// ---------------- composer ----------------

interface ComposerInitial {
  id: string;
  name: string;
  subject: string;
  body_md: string;
  segment_query: unknown;
  scheduled_at: string | null;
}

function CampaignComposer({
  initial,
  services,
  onClose,
}: {
  initial: ComposerInitial | null;
  services: ServiceOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [bodyMd, setBodyMd] = useState(initial?.body_md ?? "");
  const initialSegment = asSegment(initial?.segment_query ?? null);
  const [segType, setSegType] = useState<SegmentQuery["type"]>(
    initialSegment.type
  );
  const [tierMin, setTierMin] = useState<"insider" | "inner_circle">(
    initialSegment.type === "tier"
      ? initialSegment.params?.min ?? "insider"
      : "insider"
  );
  const [serviceId, setServiceId] = useState<string>(
    initialSegment.type === "service"
      ? initialSegment.params?.serviceId ?? services[0]?.id ?? ""
      : services[0]?.id ?? ""
  );
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">(
    initial?.scheduled_at ? "later" : "now"
  );
  const [scheduledAt, setScheduledAt] = useState<string>(
    initial?.scheduled_at
      ? toLocalInputValue(new Date(initial.scheduled_at))
      : ""
  );

  const [count, setCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [aiBrief, setAiBrief] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const segment: SegmentQuery = useMemo(() => {
    if (segType === "tier") return { type: "tier", params: { min: tierMin } };
    if (segType === "service") return { type: "service", params: { serviceId } };
    if (segType === "inactive_60d") return { type: "inactive_60d" };
    return { type: "all" };
  }, [segType, tierMin, serviceId]);

  // Live segment count, debounced.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const r = await getSegmentCount(segment);
      if (!cancelled && r.ok) setCount(r.count);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [segment]);

  const previewHtml = useMemo(
    () => marked.parse(bodyMd, { async: false }) as string,
    [bodyMd]
  );

  // ---- autosave draft every 5s when dirty -------------------------
  const dirtyRef = useRef(false);
  const persistedRef = useRef({
    name,
    subject,
    bodyMd,
    segType,
    tierMin,
    serviceId,
  });
  useEffect(() => {
    dirtyRef.current =
      persistedRef.current.name !== name ||
      persistedRef.current.subject !== subject ||
      persistedRef.current.bodyMd !== bodyMd ||
      persistedRef.current.segType !== segType ||
      persistedRef.current.tierMin !== tierMin ||
      persistedRef.current.serviceId !== serviceId;
  }, [name, subject, bodyMd, segType, tierMin, serviceId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!dirtyRef.current || !name.trim() || !subject.trim() || !bodyMd.trim()) {
        return;
      }
      setSaveStatus("saving");
      const r = await saveOrSendCampaign({
        id: savedId,
        name,
        subject,
        body_md: bodyMd,
        segment,
        intent: "draft",
      });
      if (r.ok) {
        setSavedId(r.id);
        persistedRef.current = { name, subject, bodyMd, segType, tierMin, serviceId };
        dirtyRef.current = false;
        setSaveStatus("saved");
      } else {
        setSaveStatus("idle");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [
    savedId,
    name,
    subject,
    bodyMd,
    segment,
    segType,
    tierMin,
    serviceId,
  ]);

  function submit(intent: "draft" | "schedule" | "send") {
    setError(null);
    if (!name.trim() || !subject.trim() || !bodyMd.trim()) {
      setError("Name, subject, and body are required.");
      return;
    }
    if (intent === "schedule" && !scheduledAt) {
      setError("Pick a date and time to schedule.");
      return;
    }
    startTransition(async () => {
      const r = await saveOrSendCampaign({
        id: savedId,
        name,
        subject,
        body_md: bodyMd,
        segment,
        intent,
        scheduledAt:
          intent === "schedule" && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  async function runAiAssist() {
    if (!aiBrief.trim()) return;
    setAiError(null);
    setAiBusy(true);
    try {
      const r = await aiAssistCopy(aiBrief);
      if (!r.ok) {
        setAiError(r.error);
      } else {
        setSubject(r.subject);
        setBodyMd(r.body_md);
        setAiBrief("");
      }
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] font-medium tracking-snug text-sage-deep hover:underline"
        >
          ← Back to campaigns
        </button>
        <SaveBadge state={saveStatus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            <Field label="Campaign name (internal)">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Christmas gift cards"
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
              />
            </Field>

            <Field label="Subject">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
              />
            </Field>

            <div className="rounded-[12px] border-[0.5px] border-sage/30 bg-cream-deep/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
                  AI assist
                </span>
                <Sparkles size={14} strokeWidth={1.6} className="text-sage-deep" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder="promo gift card Christmas for repeat clients"
                  className="h-10 flex-1 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1 placeholder:text-olive-faint"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={runAiAssist}
                  disabled={aiBusy || !aiBrief.trim()}
                >
                  {aiBusy ? "Drafting" : "Draft"}
                </Button>
              </div>
              {aiError && (
                <p className="mt-2 text-[12px] text-destructive">{aiError}</p>
              )}
            </div>

            <Field label="Body (markdown)">
              <textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                rows={12}
                className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-olive shadow-1"
              />
            </Field>

            <Field label="Live preview">
              <div
                className="prose-email rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/50 px-4 py-3 text-[14px] leading-relaxed text-olive"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </Field>

            {error && <p className="text-[12px] text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => submit("draft")}
                disabled={pending}
                className="text-olive-soft"
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => submit("schedule")}
                disabled={pending || scheduleMode !== "later"}
              >
                Schedule
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => submit("send")}
                disabled={pending || count === 0}
              >
                {pending ? "Working" : count === 0 ? "Empty segment" : `Send to ${count ?? "…"} people`}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="self-start p-5">
          <h3 className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Segment
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            <SegmentRadio
              label="Everyone (consenting)"
              checked={segType === "all"}
              onChange={() => setSegType("all")}
            />
            <SegmentRadio
              label="Inactive (60+ days)"
              checked={segType === "inactive_60d"}
              onChange={() => setSegType("inactive_60d")}
            />
            <SegmentRadio
              label="Tier"
              checked={segType === "tier"}
              onChange={() => setSegType("tier")}
            />
            {segType === "tier" && (
              <select
                value={tierMin}
                onChange={(e) =>
                  setTierMin(e.target.value as "insider" | "inner_circle")
                }
                className="ml-6 h-9 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-2 text-[12px] text-olive shadow-1"
              >
                <option value="insider">Insider+</option>
                <option value="inner_circle">Inner Circle only</option>
              </select>
            )}
            <SegmentRadio
              label="Booked a service"
              checked={segType === "service"}
              onChange={() => setSegType("service")}
            />
            {segType === "service" && (
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="ml-6 h-9 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-2 text-[12px] text-olive shadow-1"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-4 rounded-[12px] bg-sage/10 px-3 py-2">
            <p className="text-[12px] tracking-snug text-sage-deep">
              {count === null
                ? "Counting…"
                : `This will go to ${count} ${count === 1 ? "person" : "people"}.`}
            </p>
          </div>

          <h3 className="mt-5 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            When
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            <SegmentRadio
              label="Send now"
              checked={scheduleMode === "now"}
              onChange={() => setScheduleMode("now")}
            />
            <SegmentRadio
              label="Pick a time"
              checked={scheduleMode === "later"}
              onChange={() => setScheduleMode("later")}
            />
            {scheduleMode === "later" && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="ml-6 h-9 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-2 text-[12px] tabular-nums text-olive shadow-1"
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

function SegmentRadio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] tracking-snug text-olive">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className={cn("h-4 w-4 accent-sage")}
      />
      {label}
    </label>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "saving")
    return (
      <span className="text-[12px] tracking-snug text-olive-soft">
        Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="text-[12px] tracking-snug text-sage-deep">
        Draft saved ✓
      </span>
    );
  return null;
}

function toLocalInputValue(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}
