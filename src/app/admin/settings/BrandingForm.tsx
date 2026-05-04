"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contrastRatio, FONT_PAIRS } from "@/lib/tenant/brand-shared";
import {
  removeTenantLogo,
  updateTenantBranding,
  uploadTenantLogo,
} from "@/lib/tenant/branding-actions";

interface BrandShape {
  logoUrl: string | null;
  primaryHex: string;
  secondaryHex: string;
  backgroundHex: string;
  textHex: string;
  accentHex: string;
  fontHeading: string;
  fontBody: string;
}

/**
 * Two-column branding editor. Left: form (logo upload, 5 hex pickers,
 * font dropdowns). Right: live preview rendered with the values
 * currently in form state — no save needed to see changes.
 *
 * Fonts come from the curated FONT_PAIRS allowlist so a tenant can't
 * land on Comic Sans by accident.
 */
export function BrandingForm({
  initial,
  tenantName,
  readOnly,
}: {
  initial: BrandShape;
  tenantName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [primary, setPrimary] = useState(initial.primaryHex);
  const [secondary, setSecondary] = useState(initial.secondaryHex);
  const [background, setBackground] = useState(initial.backgroundHex);
  const [text, setText] = useState(initial.textHex);
  const [accent, setAccent] = useState(initial.accentHex);
  const [fontHeading, setFontHeading] = useState(initial.fontHeading);
  const [fontBody, setFontBody] = useState(initial.fontBody);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick the font pair that matches the current selections (or
  // "custom" if the heading/body are mismatched after a manual pick
  // — shouldn't happen via this UI, but the dropdown shows a fallback).
  const selectedPairId = useMemo(() => {
    const match = FONT_PAIRS.find(
      (p) => p.heading === fontHeading && p.body === fontBody
    );
    return match?.id ?? FONT_PAIRS[0].id;
  }, [fontHeading, fontBody]);

  const primaryOnBg = contrastRatio(primary, background);
  const textOnBg = contrastRatio(text, background);
  const lowContrast = primaryOnBg < 3.0 || textOnBg < 4.5;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateTenantBranding({
        primaryHex: primary,
        secondaryHex: secondary,
        backgroundHex: background,
        textHex: text,
        accentHex: accent,
        fontHeading,
        fontBody,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function handlePairChange(id: string) {
    const pair = FONT_PAIRS.find((p) => p.id === id);
    if (!pair) return;
    setFontHeading(pair.heading);
    setFontBody(pair.body);
  }

  async function handleLogoFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      const r = await uploadTenantLogo({
        filename: file.name,
        base64,
        contentType: file.type,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLogoUrl(r.logoUrl);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    setError(null);
    startTransition(async () => {
      const r = await removeTenantLogo();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLogoUrl(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-5">
        <div className="flex flex-col gap-5">
          {/* Logo */}
          <Field label="Logo">
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-md bg-cream-deep">
                  <Image
                    src={logoUrl}
                    alt={tenantName}
                    fill
                    sizes="64px"
                    className="object-contain"
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="flex h-16 w-16 items-center justify-center rounded-md text-cream"
                  style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
                >
                  <span className="font-serif text-[18px] font-medium">
                    {(tenantName ?? "T")[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={readOnly || uploading}
                >
                  <Camera size={14} strokeWidth={1.6} className="mr-1" />
                  {logoUrl ? "Replace" : "Upload"}
                </Button>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={readOnly || pending}
                    className="text-olive-soft hover:text-destructive"
                  >
                    <X size={14} strokeWidth={1.8} className="mr-1" />
                    Remove
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLogoFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <p className="text-[11px] tracking-snug text-olive-faint">
              PNG / JPEG / WebP / SVG. 2 MB max. Auto-resized to 512×512.
            </p>
          </Field>

          {/* Colours */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ColourField
              label="Primary"
              value={primary}
              onChange={setPrimary}
              disabled={readOnly}
            />
            <ColourField
              label="Secondary"
              value={secondary}
              onChange={setSecondary}
              disabled={readOnly}
            />
            <ColourField
              label="Accent"
              value={accent}
              onChange={setAccent}
              disabled={readOnly}
            />
            <ColourField
              label="Background"
              value={background}
              onChange={setBackground}
              disabled={readOnly}
            />
            <ColourField
              label="Body text"
              value={text}
              onChange={setText}
              disabled={readOnly}
            />
          </div>

          {lowContrast && (
            <div className="rounded-[10px] bg-destructive/10 px-3 py-2 text-[12px] tracking-snug text-destructive">
              Heads up — your current pairing fails WCAG AA. Body text needs
              4.5:1 against the background, primary needs at least 3:1 for
              clickable elements.
              <span className="ml-1 tabular-nums">
                Currently primary {primaryOnBg.toFixed(2)}:1 · text{" "}
                {textOnBg.toFixed(2)}:1.
              </span>
            </div>
          )}

          {/* Fonts */}
          <Field label="Font pair">
            <select
              value={selectedPairId}
              onChange={(e) => handlePairChange(e.target.value)}
              disabled={readOnly}
              className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 disabled:opacity-50"
            >
              {FONT_PAIRS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-[12px] text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={readOnly || pending || uploading}
            >
              {pending ? "Saving" : "Save changes"}
            </Button>
            {savedAt && !pending && (
              <span className="text-[12px] tracking-snug text-sage-deep">
                Saved ✓ — refresh any page to see it.
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="self-start overflow-hidden p-0">
        <p className="border-b-[0.5px] border-hairline px-4 py-3 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Live preview
        </p>
        <div
          className="p-5"
          style={{
            background,
            color: text,
            fontFamily: `'${fontBody}', system-ui, sans-serif`,
          }}
        >
          <p
            className="text-[24px] leading-tight tracking-tight"
            style={{
              fontFamily: `'${fontHeading}', Georgia, serif`,
              fontWeight: 500,
              color: text,
            }}
          >
            Welcome back, Sarah.
          </p>
          <p className="mt-2 text-[13px]" style={{ color: text, opacity: 0.7 }}>
            Saturday, 12 May
          </p>

          <div
            className="mt-4 rounded-[14px] p-4"
            style={{
              background: "rgba(255, 255, 255, 0.65)",
              border: `0.5px solid ${primary}33`,
            }}
          >
            <p className="text-[14px] font-medium" style={{ color: text }}>
              InfraBike · Bike 1
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: text, opacity: 0.6 }}>
              11:00am with Tove · 30 min
            </p>
          </div>

          <button
            type="button"
            disabled
            className="mt-4 inline-flex items-center justify-center rounded-md px-4 py-2 text-[13px] font-medium"
            style={{
              background: primary,
              color: background,
              fontFamily: `'${fontBody}', system-ui, sans-serif`,
            }}
          >
            Book a session
          </button>

          <span
            className="ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider"
            style={{
              background: `${accent}1f`,
              color: accent,
            }}
          >
            Insider
          </span>
        </div>
      </Card>
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

function ColourField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className={cn(
            "h-11 w-16 cursor-pointer rounded-[12px] border-[0.5px] border-hairline-strong bg-white p-1 disabled:opacity-50"
          )}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          placeholder="#5C6B4E"
          className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 font-mono text-[13px] tabular-nums text-olive shadow-1 disabled:opacity-50"
        />
      </div>
    </Field>
  );
}
