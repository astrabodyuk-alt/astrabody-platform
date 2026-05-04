"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateTenantConfig } from "./actions";

export function TenantConfigForm({
  initial,
  readOnly,
}: {
  initial: {
    name: string;
    brand_primary: string;
    brand_secondary: string;
    timezone: string;
  };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [brandPrimary, setBrandPrimary] = useState(initial.brand_primary);
  const [brandSecondary, setBrandSecondary] = useState(initial.brand_secondary);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || pending) return;
    startTransition(async () => {
      setError(null);
      const result = await updateTenantConfig({
        name,
        brand_primary: brandPrimary,
        brand_secondary: brandSecondary,
        timezone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <Field label="Tenant name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 disabled:opacity-50"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand primary (hex)">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={brandPrimary}
              onChange={(e) => setBrandPrimary(e.target.value)}
              disabled={readOnly}
              placeholder="#758564"
              className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1 disabled:opacity-50"
            />
            <span
              className="h-9 w-9 flex-shrink-0 rounded-full border-[0.5px] border-hairline"
              style={{ background: brandPrimary }}
              aria-hidden
            />
          </div>
        </Field>
        <Field label="Brand secondary (hex)">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={brandSecondary}
              onChange={(e) => setBrandSecondary(e.target.value)}
              disabled={readOnly}
              placeholder="#F6F3EE"
              className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1 disabled:opacity-50"
            />
            <span
              className="h-9 w-9 flex-shrink-0 rounded-full border-[0.5px] border-hairline"
              style={{ background: brandSecondary }}
              aria-hidden
            />
          </div>
        </Field>
      </div>

      <Field label="Timezone (IANA)">
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={readOnly}
          placeholder="Europe/London"
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 disabled:opacity-50"
        />
      </Field>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      {!readOnly && (
        <div className="self-start">
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? "Saving" : saved ? "Saved ✓" : "Save"}
          </Button>
        </div>
      )}
      {readOnly && (
        <p className="text-[12px] tracking-snug text-olive-faint">
          Read-only. Owner / admin can edit.
        </p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
