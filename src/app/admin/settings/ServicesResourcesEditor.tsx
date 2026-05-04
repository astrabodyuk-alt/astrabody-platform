"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  upsertServiceResource,
  deleteServiceResource,
  updateRescheduleCutoff,
} from "./actions";

export interface ResourceRow {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceWithResources {
  id: string;
  name: string;
  resources: ResourceRow[];
}

/**
 * Per-tenant resource editor. Lists every service that has at least
 * one resource (or all services when none, so the operator can add the
 * first one), with inline create / edit / delete controls. Drag-to-
 * reorder is intentionally out of scope — the sort_order input does
 * the same job in two seconds.
 *
 * Adjacent: a small "Reschedule cutoff" control (hours) since both
 * features ship in the same prompt.
 */
export function ServicesResourcesEditor({
  services,
  initialCutoffHours,
  readOnly,
}: {
  services: ServiceWithResources[];
  initialCutoffHours: number;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <RescheduleCutoffCard
        initial={initialCutoffHours}
        readOnly={readOnly}
      />

      <Card className="p-5">
        <h2 className="font-serif text-[20px] font-medium tracking-tight text-olive">
          Resources by service
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Add the physical units a client picks between (Bike 1 / Bike 2,
          Pad A / Pad B). Services without resources behave normally.
        </p>
        <div className="mt-4 flex flex-col gap-5">
          {services.map((s) => (
            <ServiceBlock key={s.id} service={s} readOnly={readOnly} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function RescheduleCutoffCard({
  initial,
  readOnly,
}: {
  initial: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [hours, setHours] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSave() {
    startTransition(async () => {
      const r = await updateRescheduleCutoff(hours);
      if (r.ok) {
        setSavedAt(Date.now());
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <h2 className="font-serif text-[20px] font-medium tracking-tight text-olive">
        Reschedule cutoff
      </h2>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        How many hours before the start the client can still self-move a
        booking. Admin power isn&rsquo;t affected.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min={0}
          max={168}
          value={hours}
          onChange={(e) =>
            setHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))
          }
          disabled={readOnly}
          className="h-11 w-28 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1 disabled:opacity-50"
        />
        <span className="text-[13px] tracking-snug text-olive-soft">
          hours before start
        </span>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={readOnly || pending || hours === initial}
          className="ml-auto"
        >
          {pending ? "Saving" : "Save"}
        </Button>
        {savedAt && !pending && (
          <span className="text-[12px] tracking-snug text-sage-deep">
            Saved ✓
          </span>
        )}
      </div>
    </Card>
  );
}

function ServiceBlock({
  service,
  readOnly,
}: {
  service: ServiceWithResources;
  readOnly: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="rounded-[14px] border-[0.5px] border-hairline bg-cream-deep/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium tracking-snug text-olive">
          {service.name}
        </p>
        {!readOnly && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 text-[12px] font-medium tracking-snug text-sage-deep hover:underline"
          >
            <Plus size={14} strokeWidth={1.6} />
            Add resource
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {service.resources.length === 0 && !creating && (
          <li className="text-[12px] tracking-snug text-olive-soft">
            No resources yet.
          </li>
        )}
        {service.resources.map((r) => (
          <li key={r.id}>
            <ResourceEditor
              resource={r}
              serviceId={service.id}
              readOnly={readOnly}
            />
          </li>
        ))}
        {creating && (
          <li>
            <ResourceEditor
              resource={null}
              serviceId={service.id}
              readOnly={readOnly}
              defaultSortOrder={(service.resources.at(-1)?.sort_order ?? 0) + 10}
              onCancelCreate={() => setCreating(false)}
            />
          </li>
        )}
      </ul>
    </div>
  );
}

function ResourceEditor({
  resource,
  serviceId,
  readOnly,
  defaultSortOrder,
  onCancelCreate,
}: {
  resource: ResourceRow | null;
  serviceId: string;
  readOnly: boolean;
  defaultSortOrder?: number;
  onCancelCreate?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(resource?.name ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [sortOrder, setSortOrder] = useState(
    String(resource?.sort_order ?? defaultSortOrder ?? 100)
  );
  const [isActive, setIsActive] = useState(resource?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await upsertServiceResource({
        id: resource?.id,
        serviceId,
        name,
        description,
        sortOrder: Number(sortOrder) || 100,
        isActive,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onCancelCreate?.();
    });
  }

  function handleDelete() {
    if (!resource) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteServiceResource(resource.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_80px_auto]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bike 1"
          disabled={readOnly}
          className="h-10 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Adjustable pedals (optional)"
          disabled={readOnly}
          className="h-10 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
        />
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          disabled={readOnly}
          className="h-10 rounded-[10px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] tabular-nums text-olive shadow-1 disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <Toggle
            checked={isActive}
            onChange={() => setIsActive((v) => !v)}
            disabled={readOnly}
            label="Active"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={readOnly || pending || !name.trim()}
          >
            {pending ? "Saving" : resource ? "Save" : "Create"}
          </Button>
          {resource && !readOnly && (
            <button
              type="button"
              onClick={() => setConfirmDelete((v) => !v)}
              aria-label="Delete resource"
              className="flex h-9 w-9 items-center justify-center rounded-full text-olive-soft transition-colors duration-200 ease-ios hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={14} strokeWidth={1.6} />
            </button>
          )}
          {!resource && (
            <button
              type="button"
              onClick={onCancelCreate}
              className="text-[12px] tracking-snug text-olive-soft hover:text-olive"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {confirmDelete && resource && (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] tracking-snug text-destructive">
          <span className="flex-1">
            Delete &ldquo;{resource.name}&rdquo;? Future bookings on this
            resource will block the delete until reassigned.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(false)}
            className="text-olive-soft"
            disabled={pending}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting" : "Delete"}
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-[12px] tracking-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative h-[27px] w-[44px] flex-shrink-0 rounded-full transition-colors duration-200 ease-ios disabled:opacity-50",
        checked ? "bg-sage" : "bg-[#E9E9EA]"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[23px] w-[23px] rounded-full bg-white transition-transform duration-200 ease-ios shadow-[0_2px_6px_rgba(0,0,0,0.15)]",
          checked ? "translate-x-[19px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}
