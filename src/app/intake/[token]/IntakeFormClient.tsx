"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/components/forms/SignaturePad";
import type { IntakeField } from "@/lib/forms/shared";
import { isFieldEmpty } from "@/lib/forms/shared";

export function IntakeFormClient({
  token,
  fields,
  initialAnswers,
}: {
  token: string;
  fields: IntakeField[];
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => ({ ...initialAnswers })
  );
  const [error, setError] = useState<string | null>(null);
  const [missingId, setMissingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(id: string, value: string | null): void {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value == null || value === "") delete next[id];
      else next[id] = value;
      return next;
    });
    if (missingId === id) setMissingId(null);
  }

  function submit(): void {
    setError(null);
    for (const f of fields) {
      if (!f.required) continue;
      if (isFieldEmpty(answers[f.id])) {
        setMissingId(f.id);
        setError(`Please answer "${f.label}".`);
        return;
      }
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/intake/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? "Couldn't submit. Please try again.");
          return;
        }
        router.refresh();
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {fields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          value={answers[f.id] ?? ""}
          highlightMissing={missingId === f.id}
          onChange={(v) => update(f.id, v)}
        />
      ))}

      {error && (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="min-h-[48px] w-full"
        disabled={pending}
      >
        {pending ? "Submitting…" : "Submit"}
      </Button>

      <p className="text-center text-[11px] tracking-snug text-olive-soft">
        Your answers are private and only seen by the studio team.
      </p>
    </form>
  );
}

function FieldRow({
  field,
  value,
  highlightMissing,
  onChange,
}: {
  field: IntakeField;
  value: string;
  highlightMissing: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-olive/10 bg-white p-4",
        highlightMissing && "border-destructive/60"
      )}
    >
      <label className="flex items-baseline gap-1.5 text-[14px] font-medium text-olive">
        <span>{field.label}</span>
        {field.required && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </label>

      {field.type === "text" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[15px] text-olive"
        />
      )}

      {field.type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="resize-y rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[15px] leading-snug text-olive"
        />
      )}

      {field.type === "yes_no" && (
        <div className="flex flex-wrap gap-2">
          {[
            { v: "Yes" },
            { v: "No" },
          ].map((opt) => (
            <button
              type="button"
              key={opt.v}
              onClick={() => onChange(opt.v)}
              className={cn(
                "min-h-[44px] min-w-[88px] rounded-full border px-4 text-[14px]",
                value === opt.v
                  ? "border-sage bg-sage font-medium text-cream"
                  : "border-olive/15 bg-cream text-olive hover:border-sage/40 hover:bg-sage/5"
              )}
            >
              {opt.v}
            </button>
          ))}
        </div>
      )}

      {field.type === "multiple_choice" && (
        <div className="flex flex-col gap-2">
          {(field.options ?? []).map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                "flex min-h-[44px] items-center rounded-lg border px-3 text-left text-[14px]",
                value === opt
                  ? "border-sage bg-sage/10 font-medium text-olive"
                  : "border-olive/15 bg-cream text-olive hover:border-sage/40 hover:bg-sage/5"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {field.type === "signature" && (
        <SignaturePad
          value={value || null}
          onChange={(v) => onChange(v)}
          ariaLabel={field.label}
        />
      )}
    </div>
  );
}
