"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HANDLEBARS_BY_TRIGGER } from "@/lib/email/handlebars";
import { updateEmailTemplate, sendTestEmail } from "./actions";
import { Toggle } from "@/components/ui/toggle";

interface Template {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_md: string;
  trigger: string;
  trigger_offset_minutes: number | null;
  is_active: boolean;
  updated_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual / utility",
  signup: "Signup",
  booking_confirmed: "Booking confirmed",
  booking_reminder_24h: "24h reminder",
  session_after_care: "After-care",
  reengagement_60d: "Re-engagement (60d)",
  birthday: "Birthday",
  tier_unlock: "Tier unlock",
  review_request: "Review request",
  referral_invite: "Referral invite",
};

export function TemplatesTab({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<Template | null>(null);

  // Group by trigger so the list reads as a lifecycle map.
  const groups = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const arr = map.get(t.trigger) ?? [];
      arr.push(t);
      map.set(t.trigger, arr);
    }
    return Array.from(map.entries());
  }, [templates]);

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.length === 0 && (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No templates yet. They&rsquo;re seeded automatically when a tenant
            is created.
          </p>
        </Card>
      )}
      {groups.map(([trigger, list]) => (
        <section key={trigger}>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            {TRIGGER_LABELS[trigger] ?? trigger}
          </h2>
          <ul className="flex flex-col gap-2">
            {list.map((t) => (
              <li key={t.id}>
                <Card
                  interactive
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(t)}
                  className="flex items-baseline justify-between gap-3 p-4"
                >
                  <div>
                    <p className="text-[14px] font-medium tracking-snug text-olive">
                      {t.name}
                    </p>
                    <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                      {t.subject}
                    </p>
                  </div>
                  {!t.is_active && (
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
                      style={{
                        background: "rgba(62,62,49,0.06)",
                        color: "rgba(62,62,49,0.62)",
                      }}
                    >
                      paused
                    </span>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [bodyMd, setBodyMd] = useState(template.body_md);
  const [isActive, setIsActive] = useState(template.is_active);
  const [savedAt, setSavedAt] = useState<string>(template.updated_at);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [pending, startTransition] = useTransition();
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [testError, setTestError] = useState<string | null>(null);

  // Live HTML preview of the markdown body.
  const previewHtml = useMemo(
    () => marked.parse(bodyMd, { async: false }) as string,
    [bodyMd]
  );

  // Variables for this template's trigger.
  const handlebars = HANDLEBARS_BY_TRIGGER[template.trigger] ?? [];

  // ---- autosave every 5s when there's a dirty diff ------------------
  const dirtyRef = useRef(false);
  const lastPersistedRef = useRef({
    name: template.name,
    subject: template.subject,
    body_md: template.body_md,
    is_active: template.is_active,
  });

  useEffect(() => {
    const dirty =
      lastPersistedRef.current.name !== name ||
      lastPersistedRef.current.subject !== subject ||
      lastPersistedRef.current.body_md !== bodyMd ||
      lastPersistedRef.current.is_active !== isActive;
    dirtyRef.current = dirty;
  }, [name, subject, bodyMd, isActive]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!dirtyRef.current) return;
      setSavingState("saving");
      const r = await updateEmailTemplate({
        id: template.id,
        name,
        subject,
        body_md: bodyMd,
        is_active: isActive,
      });
      if (r.ok) {
        lastPersistedRef.current = {
          name,
          subject,
          body_md: bodyMd,
          is_active: isActive,
        };
        dirtyRef.current = false;
        setSavedAt(r.updatedAt);
        setSavingState("saved");
      } else {
        setSavingState("idle");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [template.id, name, subject, bodyMd, isActive]);

  function handleManualSave() {
    startTransition(async () => {
      setSavingState("saving");
      const r = await updateEmailTemplate({
        id: template.id,
        name,
        subject,
        body_md: bodyMd,
        is_active: isActive,
      });
      if (r.ok) {
        lastPersistedRef.current = {
          name,
          subject,
          body_md: bodyMd,
          is_active: isActive,
        };
        dirtyRef.current = false;
        setSavedAt(r.updatedAt);
        setSavingState("saved");
        router.refresh();
      } else {
        setSavingState("idle");
      }
    });
  }

  function handleSendTest() {
    setTestError(null);
    setTestState("sending");
    startTransition(async () => {
      // Save pending changes first so the test reflects what's edited.
      await updateEmailTemplate({
        id: template.id,
        name,
        subject,
        body_md: bodyMd,
      });
      const r = await sendTestEmail({ templateId: template.id });
      if (r.ok) {
        setTestState("sent");
        setTimeout(() => setTestState("idle"), 3000);
      } else {
        setTestState("error");
        setTestError(r.error);
      }
    });
  }

  function insertHandlebar(name: string) {
    const tag = `{{${name}}}`;
    setBodyMd((b) => `${b}${b.endsWith(" ") || b.length === 0 ? "" : " "}${tag}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] font-medium tracking-snug text-sage-deep hover:underline"
        >
          ← Back to templates
        </button>
        <SaveBadge state={savingState} savedAt={savedAt} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            <Field label="Name (internal)">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
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

            <Field label="Body (markdown)">
              <textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                rows={14}
                className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-olive shadow-1"
              />
            </Field>

            <Field label="Live preview">
              <div
                className="prose-email rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/50 px-4 py-3 text-[14px] leading-relaxed text-olive"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </Field>

            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] tracking-snug text-olive">
                Active
              </span>
              <Toggle
                checked={isActive}
                onChange={() => setIsActive((v) => !v)}
                label="Active"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleManualSave}
                disabled={pending}
              >
                {pending ? "Saving" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSendTest}
                disabled={pending}
              >
                {testState === "sending"
                  ? "Sending"
                  : testState === "sent"
                    ? "Sent ✓"
                    : "Send test to me"}
              </Button>
            </div>
            {testError && (
              <p className="text-[12px] text-destructive">{testError}</p>
            )}
          </div>
        </Card>

        <Card className="self-start p-5">
          <h3 className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Available variables
          </h3>
          <p className="mt-1 text-[12px] tracking-snug text-olive-soft">
            Tap to insert at the end of the body.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {handlebars.length === 0 && (
              <li className="text-[12px] tracking-snug text-olive-faint">
                No specific variables for this trigger.
              </li>
            )}
            {handlebars.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  onClick={() => insertHandlebar(h)}
                  className="w-full rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-2 py-1 text-left font-mono text-[12px] tracking-snug text-olive transition-colors duration-200 ease-ios hover:bg-cream-deep"
                >
                  {`{{${h}}}`}
                </button>
              </li>
            ))}
          </ul>
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

function SaveBadge({
  state,
  savedAt,
}: {
  state: "idle" | "saving" | "saved";
  savedAt: string;
}) {
  if (state === "saving") {
    return (
      <span className="text-[12px] tracking-snug text-olive-soft">Saving…</span>
    );
  }
  if (state === "saved") {
    return (
      <span className="text-[12px] tracking-snug text-sage-deep">
        Saved ✓
      </span>
    );
  }
  return (
    <span className="text-[12px] tracking-snug text-olive-faint">
      Last saved {relativeTime(savedAt)}
    </span>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "a moment ago";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
