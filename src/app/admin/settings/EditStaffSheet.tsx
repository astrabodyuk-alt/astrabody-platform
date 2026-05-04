"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { updateStaffProfile } from "./actions";

interface StaffShape {
  id: string;
  display_name: string;
  photo_url: string | null;
  bio_short: string | null;
  specialties: string[] | null;
  commission_rate_pct: number | null;
}

const BIO_LIMIT = 160;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function EditStaffSheet({
  open,
  staff,
  serviceNames,
  canEditCommission,
  onClose,
}: {
  open: boolean;
  staff: StaffShape | null;
  serviceNames: string[];
  canEditCommission: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Sheet content is keyed by staff?.id so reopening for a different
  // staff resets all the local form state cleanly.
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent>
        {staff && (
          <Editor
            key={staff.id}
            staff={staff}
            serviceNames={serviceNames}
            canEditCommission={canEditCommission}
            fileRef={fileRef}
            onSaved={() => {
              router.refresh();
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Editor({
  staff,
  serviceNames,
  canEditCommission,
  fileRef,
  onSaved,
}: {
  staff: StaffShape;
  serviceNames: string[];
  canEditCommission: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
  onSaved: () => void;
}) {
  const [bio, setBio] = useState(staff.bio_short ?? "");
  const [specialties, setSpecialties] = useState<string[]>(
    staff.specialties ?? []
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(staff.photo_url);
  const [commissionRate, setCommissionRate] = useState<string>(
    (staff.commission_rate_pct ?? 10).toFixed(1)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [customSpec, setCustomSpec] = useState("");

  // Suggestions are the tenant's bookable service names plus what's
  // currently on the staff that isn't in that list.
  const allSuggestions = Array.from(
    new Set([...serviceNames, ...(staff.specialties ?? [])])
  );

  function toggleSpecialty(name: string) {
    setSpecialties((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  function addCustomSpecialty() {
    const v = customSpec.trim();
    if (!v) return;
    if (specialties.includes(v)) return;
    setSpecialties((prev) => [...prev, v]);
    setCustomSpec("");
  }

  async function handlePhotoFile(file: File) {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Photo must be JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Photo must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${staff.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("staff-photos")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage
        .from("staff-photos")
        .getPublicUrl(path);
      // Append a cache-buster so the new photo replaces any cached old one.
      const fresh = `${pub.publicUrl}?v=${Date.now()}`;
      setPhotoUrl(fresh);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setError(null);
    setUploading(true);
    try {
      // The actual storage object stays put — flipping photo_url to null
      // just hides it from the UI. Storage objects are cheap; clearing
      // the path on every "remove" would race with re-uploads. If you
      // want zero-orphans, sweep on a cron.
      setPhotoUrl(null);
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    startTransition(async () => {
      setError(null);
      let rateNum: number | undefined;
      if (canEditCommission) {
        const parsed = Number(commissionRate);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          setError("Commission rate must be a number between 0 and 100.");
          return;
        }
        rateNum = parsed;
      }
      const result = await updateStaffProfile({
        staffId: staff.id,
        bio_short: bio,
        specialties,
        photo_url: photoUrl,
        commission_rate_pct: rateNum,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit profile · {staff.display_name}</SheetTitle>
        <SheetDescription>
          What clients see on the practitioner picker.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5">
        {/* Photo */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Photo
          </span>
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={staff.display_name}
                width={88}
                height={88}
                className="h-[88px] w-[88px] rounded-full object-cover"
              />
            ) : (
              <InitialsCircle name={staff.display_name} />
            )}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Camera size={14} strokeWidth={1.6} className="mr-1" />
                {photoUrl ? "Replace" : "Upload"}
              </Button>
              {photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                  className="text-olive-soft hover:text-destructive"
                >
                  Remove
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <p className="text-[11px] tracking-snug text-olive-faint">
            Square JPEG, PNG, or WebP. 5 MB max.
          </p>
        </div>

        {/* Bio */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
            rows={3}
            placeholder="A sentence or two clients will see under your name."
            className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
          <span
            className={cn(
              "self-end text-[11px] tabular-nums",
              bio.length >= BIO_LIMIT - 10 ? "text-destructive" : "text-olive-faint"
            )}
          >
            {bio.length} / {BIO_LIMIT}
          </span>
        </label>

        {/* Specialties */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Specialties
          </span>
          <div className="flex flex-wrap gap-2">
            {allSuggestions.map((name) => {
              const selected = specialties.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSpecialty(name)}
                  className={cn(
                    "rounded-full border-[0.5px] px-3 py-1 text-[12px] font-medium tracking-snug transition-colors duration-200 ease-ios",
                    selected
                      ? "border-transparent bg-sage text-cream"
                      : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
                  )}
                  aria-pressed={selected}
                >
                  {name}
                </button>
              );
            })}
            {specialties
              .filter((s) => !allSuggestions.includes(s))
              .map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border-transparent bg-sage px-3 py-1 text-[12px] font-medium text-cream"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => toggleSpecialty(name)}
                    aria-label={`Remove ${name}`}
                    className="ax-tap"
                  >
                    <X size={12} strokeWidth={1.8} />
                  </button>
                </span>
              ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={customSpec}
              onChange={(e) => setCustomSpec(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomSpecialty();
                }
              }}
              placeholder="Add another"
              className="h-9 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[13px] text-olive shadow-1 placeholder:text-olive-faint"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addCustomSpecialty}
              disabled={!customSpec.trim()}
            >
              Add
            </Button>
          </div>
        </div>

        {canEditCommission && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
              Commission rate
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="h-11 w-28 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
              />
              <span className="text-[14px] tracking-snug text-olive-soft">%</span>
            </div>
            <p className="text-[11px] tracking-snug text-olive-faint">
              Applied at the moment a booking is confirmed. Past commissions
              keep the rate they were issued at.
            </p>
          </div>
        )}

        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={pending || uploading}
        >
          {pending ? "Saving" : "Save"}
        </Button>
      </SheetFooter>
    </>
  );
}

function InitialsCircle({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="flex h-[88px] w-[88px] flex-shrink-0 items-center justify-center rounded-full text-[22px] font-medium tracking-snug text-cream"
      style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      aria-hidden
    >
      {initials || "✨"}
    </div>
  );
}
