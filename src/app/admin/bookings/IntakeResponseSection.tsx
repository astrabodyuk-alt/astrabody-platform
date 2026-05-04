"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Mail, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntakeField } from "@/lib/forms/shared";
import { resendIntakeLink } from "@/lib/forms/actions";

export interface IntakeResponseEmbed {
  id: string;
  submitted_at: string | null;
  expires_at: string;
  answers: Record<string, string>;
  intake_forms:
    | { name: string; fields: IntakeField[] }
    | { name: string; fields: IntakeField[] }[]
    | null;
}

export function IntakeResponseSection({
  bookingId,
  embed,
}: {
  bookingId: string;
  embed: IntakeResponseEmbed | null;
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!embed) return null;

  const form = Array.isArray(embed.intake_forms)
    ? embed.intake_forms[0]
    : embed.intake_forms;
  if (!form) return null;

  const submitted = !!embed.submitted_at;
  const expired =
    !submitted && new Date(embed.expires_at).getTime() < Date.now();

  return (
    <section className="rounded-xl border border-olive/10 bg-cream p-4">
      <div className="flex items-center gap-1.5">
        <FileText className="size-3.5 text-olive-soft" />
        <h3 className="text-[13px] font-medium uppercase tracking-label-caps text-olive-soft">
          Intake form
        </h3>
      </div>
      <p className="mt-1 text-[13px] tracking-snug text-olive">{form.name}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {submitted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage/20 px-2.5 py-1 text-[11px] tracking-snug text-sage-deep">
            Completed · {formatDistanceToNowStrict(new Date(embed.submitted_at!))} ago
          </span>
        ) : expired ? (
          <span className="rounded-full bg-olive/10 px-2.5 py-1 text-[11px] tracking-snug text-olive-soft">
            Expired
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] tracking-snug text-amber-900">
            Awaiting response
          </span>
        )}

        {submitted && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAnswers((v) => !v)}
          >
            {showAnswers ? "Hide answers" : "View answers"}
          </Button>
        )}

        {!submitted && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await resendIntakeLink(bookingId);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setResent(true);
              })
            }
            className="gap-1.5"
          >
            <Mail className="size-3.5" />
            {pending ? "Sending…" : "Resend link"}
          </Button>
        )}

        {resent && (
          <span className="text-[11px] tracking-snug text-sage-deep">
            Sent.
          </span>
        )}
        {error && (
          <span className="text-[11px] tracking-snug text-destructive">
            {error}
          </span>
        )}
      </div>

      {showAnswers && submitted && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-olive/10 pt-3">
          {form.fields.map((f) => (
            <li key={f.id} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-snug text-olive-soft">
                {f.label}
              </span>
              <AnswerValue field={f} value={embed.answers?.[f.id] ?? ""} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AnswerValue({ field, value }: { field: IntakeField; value: string }) {
  if (field.type === "signature") {
    if (!value) {
      return (
        <span className="text-[12px] tracking-snug text-olive-soft">
          (no signature)
        </span>
      );
    }
    return (
      <div className="rounded-lg border border-olive/10 bg-white p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt={field.label}
          className="h-32 w-full object-contain"
        />
      </div>
    );
  }
  if (!value) {
    return (
      <span className="text-[13px] tracking-snug text-olive-soft">—</span>
    );
  }
  return (
    <span className="whitespace-pre-line text-[13px] tracking-snug text-olive">
      {value}
    </span>
  );
}
