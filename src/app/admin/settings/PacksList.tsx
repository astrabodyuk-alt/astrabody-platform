"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn, formatGBP } from "@/lib/utils";
import { upsertServicePackage } from "./actions";

interface PackRow {
  id: string;
  name: string;
  short_description: string | null;
  sessions_count: number;
  price_pence: number;
  validity_months: number;
  is_active: boolean;
  sort_order: number;
  service_id: string;
  service_name: string;
}

interface ServiceOption {
  id: string;
  name: string;
}

/**
 * Catalogue editor for service_packages. Owner-only (gated by
 * `isOwner` prop — the sheet's save button is disabled otherwise, and
 * the action also re-checks).
 */
export function PacksList({
  packs,
  services,
  isOwner,
}: {
  packs: PackRow[];
  services: ServiceOption[];
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState<PackRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] tracking-snug text-olive-soft">
          Pack catalogue &middot; sold in studio via /admin/sales/new.
        </p>
        {isOwner && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
          >
            + New pack
          </Button>
        )}
      </div>

      {packs.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No packs in the catalogue yet.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {packs.map((p) => (
            <li key={p.id}>
              <Card
                interactive={isOwner}
                role={isOwner ? "button" : undefined}
                tabIndex={isOwner ? 0 : undefined}
                onClick={isOwner ? () => setEditing(p) : undefined}
                className="flex items-baseline justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-[14px] font-medium tracking-snug text-olive">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                    {p.service_name} &middot; {p.sessions_count} sessions &middot;{" "}
                    {p.validity_months} mo validity
                  </p>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-[18px] font-medium tabular-nums text-sage-deep">
                    {formatGBP(p.price_pence)}
                  </span>
                  {!p.is_active && (
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
                      style={{
                        background: "rgba(62,62,49,0.06)",
                        color: "rgba(62,62,49,0.62)",
                      }}
                    >
                      hidden
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!editing || creating}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <SheetContent>
          {(editing || creating) && (
            <PackEditor
              key={editing?.id ?? "new"}
              pack={editing}
              services={services}
              onClose={() => {
                setEditing(null);
                setCreating(false);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PackEditor({
  pack,
  services,
  onClose,
}: {
  pack: PackRow | null;
  services: ServiceOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(pack?.name ?? "");
  const [shortDescription, setShortDescription] = useState(
    pack?.short_description ?? ""
  );
  const [serviceId, setServiceId] = useState(
    pack?.service_id ?? services[0]?.id ?? ""
  );
  const [sessions, setSessions] = useState(String(pack?.sessions_count ?? 4));
  const [pricePounds, setPricePounds] = useState(
    pack ? (pack.price_pence / 100).toFixed(2) : ""
  );
  const [validity, setValidity] = useState(String(pack?.validity_months ?? 6));
  const [isActive, setIsActive] = useState(pack?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(pack?.sort_order ?? 100));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const sessionsN = Number(sessions);
    const priceN = Number(pricePounds);
    const validityN = Number(validity);
    const sortN = Number(sortOrder);
    startTransition(async () => {
      const r = await upsertServicePackage({
        id: pack?.id,
        serviceId,
        name,
        shortDescription: shortDescription || null,
        sessionsCount: sessionsN,
        pricePence: Math.round(priceN * 100),
        validityMonths: validityN,
        isActive,
        sortOrder: Number.isFinite(sortN) ? sortN : 100,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{pack ? "Edit pack" : "New pack"}</SheetTitle>
        <SheetDescription>
          Catalogue entry &middot; sold price + sessions are snapshotted on
          each sale, so editing here only affects future sales.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
          />
        </Field>
        <Field label="Service">
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Short description (optional)">
          <input
            type="text"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="10 sessions · best value"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sessions">
            <input
              type="number"
              min={1}
              step={1}
              value={sessions}
              onChange={(e) => setSessions(e.target.value)}
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
            />
          </Field>
          <Field label="Validity (months)">
            <input
              type="number"
              min={1}
              step={1}
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
            />
          </Field>
        </div>

        <Field label="Price (GBP)">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-olive-soft">£</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              className="h-11 w-full rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
            />
          </div>
        </Field>

        <Field label="Sort order">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
          />
        </Field>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] tracking-snug text-olive">
            Visible in /admin/sales/new
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              "relative h-[31px] w-[51px] flex-shrink-0 rounded-full transition-colors duration-200 ease-ios",
              isActive ? "bg-sage" : "bg-[#E9E9EA]"
            )}
          >
            <span
              className={cn(
                "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-ios",
                "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]",
                isActive ? "translate-x-[22px]" : "translate-x-[2px]"
              )}
            />
          </button>
        </label>

        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={pending || !name.trim() || !serviceId}
        >
          {pending ? "Saving" : pack ? "Save changes" : "Create pack"}
        </Button>
      </SheetFooter>
    </>
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
