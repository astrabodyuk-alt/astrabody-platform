"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  upsertIntakeForm,
  deleteIntakeForm,
} from "@/lib/forms/actions";
import {
  INTAKE_TEMPLATES,
  type IntakeTemplate,
} from "@/lib/forms/intake-templates";
import type { IntakeField, IntakeFormRow } from "@/lib/forms/shared";

interface ServiceOption {
  id: string;
  name: string;
}

export function IntakeFormsTab({
  forms,
  services,
}: {
  forms: IntakeFormRow[];
  services: ServiceOption[];
}) {
  const [editing, setEditing] = useState<EditState | null>(null);

  if (editing) {
    return (
      <FormBuilder
        initial={editing}
        services={services}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
            Intake forms
          </h2>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            Custom health checks and consent forms attached per service.
            Sent automatically 24h before each appointment.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditing(blankState())}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          New form
        </Button>
      </div>

      <ul className="mt-5 flex flex-col divide-y divide-olive/10 border-t border-olive/10">
        {forms.length === 0 && (
          <li className="py-4 text-[13px] tracking-snug text-olive-soft">
            No forms yet. Create one for treatments that need a health
            check or consent (Fat Freezing, Laser, EMS).
          </li>
        )}
        {forms.map((f) => (
          <FormRow
            key={f.id}
            form={f}
            services={services}
            onEdit={() => setEditing(stateFromExisting(f))}
          />
        ))}
      </ul>
    </Card>
  );
}

function FormRow({
  form,
  services,
  onEdit,
}: {
  form: IntakeFormRow;
  services: ServiceOption[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const serviceLabels = form.service_ids
    .map((id) => services.find((s) => s.id === id)?.name)
    .filter((s): s is string => !!s);

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-sage" />
          <span className="text-[14px] font-medium text-olive">
            {form.name}
          </span>
          {!form.is_active && (
            <span className="rounded-full bg-olive/10 px-2 py-0.5 text-[11px] tracking-snug text-olive-soft">
              Disabled
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
          {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
          {serviceLabels.length > 0 ? ` · ${serviceLabels.join(", ")}` : " · No services attached"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <button
          type="button"
          aria-label="Delete form"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteIntakeForm(form.id);
              router.refresh();
            })
          }
          className="rounded-md p-2 text-olive-soft hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

// ============================================================
// Builder
// ============================================================

interface EditState {
  id: string | null;
  name: string;
  serviceIds: string[];
  fields: IntakeField[];
  isActive: boolean;
}

function blankState(): EditState {
  return {
    id: null,
    name: "",
    serviceIds: [],
    fields: [],
    isActive: true,
  };
}

function stateFromExisting(f: IntakeFormRow): EditState {
  return {
    id: f.id,
    name: f.name,
    serviceIds: [...f.service_ids],
    fields: f.fields.map((field) => ({ ...field })),
    isActive: f.is_active,
  };
}

function FormBuilder({
  initial,
  services,
  onClose,
}: {
  initial: EditState;
  services: ServiceOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditState>(initial);
  const [pickingTemplate, setPickingTemplate] = useState<boolean>(
    !initial.id && initial.fields.length === 0
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyTemplate(t: IntakeTemplate): void {
    setState((prev) => ({
      ...prev,
      name: prev.name || t.name,
      fields: t.fields.map((f) => ({ ...f, id: cryptoId() })),
    }));
    setPickingTemplate(false);
  }

  function addField(): void {
    setState((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          id: cryptoId(),
          type: "text",
          label: "New question",
          required: false,
        },
      ],
    }));
  }

  function updateField(id: string, patch: Partial<IntakeField>): void {
    setState((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function removeField(id: string): void {
    setState((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
  }

  function move(id: string, dir: -1 | 1): void {
    setState((prev) => {
      const idx = prev.fields.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.fields.length) return prev;
      const next = [...prev.fields];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return { ...prev, fields: next };
    });
  }

  function toggleService(id: string): void {
    setState((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter((s) => s !== id)
        : [...prev.serviceIds, id],
    }));
  }

  function save(): void {
    setError(null);
    startTransition(async () => {
      const res = await upsertIntakeForm({
        id: state.id,
        name: state.name,
        serviceIds: state.serviceIds,
        fields: state.fields,
        isActive: state.isActive,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[20px] font-medium leading-tight text-olive">
              {state.id ? "Edit form" : "New intake form"}
            </h2>
            <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
              Build the questions clients answer before their appointment.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Form name
            </span>
            <input
              type="text"
              value={state.name}
              onChange={(e) =>
                setState((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Fat Freezing Health Check"
              className="rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[12px] tracking-snug text-olive-soft">
              Attach to services
            </span>
            <div className="flex flex-wrap gap-2">
              {services.length === 0 && (
                <span className="text-[12px] tracking-snug text-olive-soft">
                  No bookable services yet.
                </span>
              )}
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px]",
                    state.serviceIds.includes(s.id)
                      ? "border-sage bg-sage font-medium text-cream"
                      : "border-olive/15 bg-cream text-olive hover:border-sage/40 hover:bg-sage/5"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-olive/10 bg-sand/20 px-3 py-2.5">
            <span className="text-[14px] text-olive">Active</span>
            <input
              type="checkbox"
              checked={state.isActive}
              onChange={(e) =>
                setState((prev) => ({ ...prev, isActive: e.target.checked }))
              }
              className="size-5 rounded border-olive/15 text-sage focus:ring-sage"
            />
          </label>
        </div>
      </Card>

      {pickingTemplate && (
        <Card className="p-5">
          <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
            Start from a template
          </h3>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            Or skip and build from scratch.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {INTAKE_TEMPLATES.map((t) => (
              <li key={t.slug}>
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-olive/10 bg-cream p-3 text-left hover:border-sage/40 hover:bg-sage/5"
                >
                  <span className="text-[14px] font-medium text-olive">
                    {t.name}
                  </span>
                  <span className="text-[12px] tracking-snug text-olive-soft">
                    {t.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPickingTemplate(false)}
            >
              Build from scratch
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
            Fields
          </h3>
          <Button size="sm" onClick={addField} className="gap-1.5">
            <Plus className="size-4" />
            Add field
          </Button>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {state.fields.length === 0 && (
            <li className="text-[13px] tracking-snug text-olive-soft">
              No fields yet — add one or start from a template.
            </li>
          )}
          {state.fields.map((f, i) => (
            <li key={f.id}>
              <FieldEditor
                field={f}
                isFirst={i === 0}
                isLast={i === state.fields.length - 1}
                onChange={(patch) => updateField(f.id, patch)}
                onRemove={() => removeField(f.id)}
                onMove={(dir) => move(f.id, dir)}
              />
            </li>
          ))}
        </ul>
      </Card>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save form"}
        </Button>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMove,
}: {
  field: IntakeField;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<IntakeField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [optionDraft, setOptionDraft] = useState("");

  return (
    <div className="rounded-xl border border-olive/10 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={field.type}
          onChange={(e) =>
            onChange({
              type: e.target.value as IntakeField["type"],
              options:
                e.target.value === "multiple_choice"
                  ? field.options ?? ["Option 1", "Option 2"]
                  : undefined,
            })
          }
          className="rounded-md border border-olive/15 bg-cream px-2 py-1 text-[13px] text-olive"
        >
          <option value="text">Text</option>
          <option value="textarea">Long text</option>
          <option value="yes_no">Yes / No</option>
          <option value="multiple_choice">Multiple choice</option>
          <option value="signature">Signature</option>
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Move up"
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={isLast}
            onClick={() => onMove(1)}
            className="rounded-md p-1.5 text-olive-soft hover:bg-sage/5 hover:text-olive disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remove"
            onClick={onRemove}
            className="rounded-md p-1.5 text-olive-soft hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <input
        type="text"
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Question label"
        className="mt-2 w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[14px] text-olive"
      />

      <label className="mt-2 inline-flex items-center gap-2 text-[12px] text-olive">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="size-4 rounded border-olive/15 text-sage focus:ring-sage"
        />
        Required
      </label>

      {field.type === "multiple_choice" && (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-[11px] tracking-snug text-olive-soft">
            Options
          </span>
          <ul className="flex flex-col gap-1">
            {(field.options ?? []).map((opt, i) => (
              <li
                key={`${opt}-${i}`}
                className="flex items-center gap-2 rounded-md bg-sand/30 px-2 py-1"
              >
                <span className="flex-1 text-[13px] text-olive">{opt}</span>
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() =>
                    onChange({
                      options: (field.options ?? []).filter((_, idx) => idx !== i),
                    })
                  }
                  className="text-[11px] text-olive-soft hover:text-destructive"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              type="text"
              value={optionDraft}
              onChange={(e) => setOptionDraft(e.target.value)}
              placeholder="Add an option"
              className="flex-1 rounded-md border border-olive/15 bg-cream px-2 py-1 text-[13px] text-olive"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const v = optionDraft.trim();
                if (!v) return;
                onChange({
                  options: [...(field.options ?? []), v],
                });
                setOptionDraft("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Tiny fallback — should never hit modern browsers.
  return `f-${Math.random().toString(36).slice(2, 10)}`;
}
