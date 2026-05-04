"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contrastRatio, FONT_PAIRS } from "@/lib/tenant/brand-shared";
import { checkSlugAvailability, provisionTenant } from "./actions";

type Step = 1 | 2 | 3 | 4 | 5;

interface State {
  // Step 1
  name: string;
  slug: string;
  ownerEmail: string;
  timezone: string;
  // Step 2
  primaryHex: string;
  secondaryHex: string;
  backgroundHex: string;
  textHex: string;
  accentHex: string;
  fontPairId: string;
  // Step 3
  serviceTemplate: "wellness" | "aesthetics" | "hair_beauty" | "custom";
  // Step 4 — kept on a single default; tenant edits hours later
  // (see /admin/settings → Working hours).
  // Step 5 — result
  resultUrl: string | null;
  resultSlug: string | null;
}

const DEFAULTS: State = {
  name: "",
  slug: "",
  ownerEmail: "",
  timezone: "Europe/London",
  primaryHex: "#5C6B4E",
  secondaryHex: "#BBC4AA",
  backgroundHex: "#F6F3EE",
  textHex: "#3E3E31",
  accentHex: "#758564",
  fontPairId: "cormorant-inter",
  serviceTemplate: "wellness",
  resultUrl: null,
  resultSlug: null,
};

const TEMPLATE_LABELS: Record<State["serviceTemplate"], string> = {
  wellness: "Wellness studio",
  aesthetics: "Aesthetics clinic",
  hair_beauty: "Hair & beauty",
  custom: "Custom (no defaults)",
};

const TEMPLATE_BLURBS: Record<State["serviceTemplate"], string> = {
  wellness: "InfraBike + EMS, 30-min sessions, deposit-protected.",
  aesthetics: "Fat freezing + laser hair removal, deposits required.",
  hair_beauty: "Cut + colour, 60-120 min, optional deposits.",
  custom: "Start empty. Add your own services in /admin/settings.",
};

export function OnboardWizard() {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<State>(DEFAULTS);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slugCheck, setSlugCheck] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  function patch(p: Partial<State>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  // Live slug availability check, debounced.
  useEffect(() => {
    if (!state.slug) {
      setSlugCheck(null);
      return;
    }
    setSlugChecking(true);
    const handle = setTimeout(async () => {
      const r = await checkSlugAvailability(state.slug);
      if (r.ok) setSlugCheck({ available: r.available, reason: r.reason });
      setSlugChecking(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [state.slug]);

  const fontPair = FONT_PAIRS.find((p) => p.id === state.fontPairId) ?? FONT_PAIRS[0];

  const primaryOnBg = contrastRatio(state.primaryHex, state.backgroundHex);
  const textOnBg = contrastRatio(state.textHex, state.backgroundHex);
  const lowContrast = primaryOnBg < 3.0 || textOnBg < 4.5;

  const canProceedStep1 =
    state.name.trim().length > 0 &&
    state.slug.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.ownerEmail.trim()) &&
    slugCheck?.available === true;
  const canProceedStep2 = !lowContrast;

  function handleProvision() {
    setError(null);
    startTransition(async () => {
      const r = await provisionTenant({
        name: state.name.trim(),
        slug: state.slug.trim().toLowerCase(),
        ownerEmail: state.ownerEmail.trim().toLowerCase(),
        timezone: state.timezone.trim() || "Europe/London",
        primaryHex: state.primaryHex,
        secondaryHex: state.secondaryHex,
        backgroundHex: state.backgroundHex,
        textHex: state.textHex,
        accentHex: state.accentHex,
        fontHeading: fontPair.heading,
        fontBody: fontPair.body,
        serviceTemplate: state.serviceTemplate,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      patch({ resultUrl: r.url, resultSlug: r.slug });
      setStep(5);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <Stepper step={step} />

        {step === 1 && (
          <Step1
            state={state}
            patch={patch}
            slugCheck={slugCheck}
            slugChecking={slugChecking}
          />
        )}
        {step === 2 && <Step2 state={state} patch={patch} />}
        {step === 3 && <Step3 state={state} patch={patch} />}
        {step === 4 && <Step4 />}
        {step === 5 && <Step5 state={state} />}

        {error && step !== 5 && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}

        {step !== 5 && (
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setStep((s) => (Math.max(1, s - 1) as Step))
              }
              disabled={step === 1 || pending}
              className="text-olive-soft"
            >
              Back
            </Button>
            {step < 4 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  setStep((s) => (Math.min(4, s + 1) as Step))
                }
                disabled={
                  pending ||
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2)
                }
              >
                Continue
              </Button>
            )}
            {step === 4 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleProvision}
                disabled={pending}
              >
                {pending ? "Spinning up" : "Create studio"}
              </Button>
            )}
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <PreviewCard state={state} fontPair={fontPair} />
      </aside>
    </div>
  );
}

// ---- Stepper -------------------------------------------------------

function Stepper({ step }: { step: Step }) {
  const labels = ["Basics", "Branding", "Services", "Hours", "Done"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const idx = (i + 1) as Step;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium tabular-nums",
                active
                  ? "bg-sage text-cream"
                  : done
                    ? "bg-sage-deep text-cream"
                    : "bg-cream-deep text-olive-soft"
              )}
            >
              {idx}
            </div>
            <span
              className={cn(
                "text-[12px] font-medium tracking-snug",
                active ? "text-olive" : "text-olive-soft"
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <div
                className={cn(
                  "ml-1 h-px flex-1",
                  idx < step ? "bg-sage-deep" : "bg-hairline"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Step 1: Basics -------------------------------------------------

function Step1({
  state,
  patch,
  slugCheck,
  slugChecking,
}: {
  state: State;
  patch: (p: Partial<State>) => void;
  slugCheck: { available: boolean; reason?: string } | null;
  slugChecking: boolean;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Studio basics
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Studio name">
          <input
            type="text"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="The Wellness Rooms"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </Field>
        <Field label="Slug (URL)">
          <input
            type="text"
            value={state.slug}
            onChange={(e) =>
              patch({
                slug: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, ""),
              })
            }
            placeholder="wellness-rooms"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 font-mono text-[13px] text-olive shadow-1 placeholder:text-olive-faint"
          />
          <p className="text-[11px] tracking-snug text-olive-faint">
            {state.slug
              ? slugChecking
                ? "Checking…"
                : slugCheck
                  ? slugCheck.available
                    ? `${state.slug}.atavoplatform.com is available ✓`
                    : `Unavailable — ${slugCheck.reason}`
                  : ""
              : "Letters, numbers, hyphens. Becomes <slug>.atavoplatform.com."}
          </p>
        </Field>
        <Field label="Owner email">
          <input
            type="email"
            value={state.ownerEmail}
            onChange={(e) => patch({ ownerEmail: e.target.value })}
            placeholder="owner@studio.com"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
          <p className="text-[11px] tracking-snug text-olive-faint">
            They&rsquo;ll get an invite link to set their password.
          </p>
        </Field>
        <Field label="Timezone">
          <input
            type="text"
            value={state.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
            placeholder="Europe/London"
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
        </Field>
      </div>
    </Card>
  );
}

// ---- Step 2: Branding ----------------------------------------------

function Step2({
  state,
  patch,
}: {
  state: State;
  patch: (p: Partial<State>) => void;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Branding
      </h2>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        Pick the palette + fonts. The owner can change anything in
        /admin/settings later.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ColourField
          label="Primary"
          value={state.primaryHex}
          onChange={(v) => patch({ primaryHex: v })}
        />
        <ColourField
          label="Secondary"
          value={state.secondaryHex}
          onChange={(v) => patch({ secondaryHex: v })}
        />
        <ColourField
          label="Accent"
          value={state.accentHex}
          onChange={(v) => patch({ accentHex: v })}
        />
        <ColourField
          label="Background"
          value={state.backgroundHex}
          onChange={(v) => patch({ backgroundHex: v })}
        />
        <ColourField
          label="Body text"
          value={state.textHex}
          onChange={(v) => patch({ textHex: v })}
        />
      </div>
      <Field label="Font pair">
        <select
          value={state.fontPairId}
          onChange={(e) => patch({ fontPairId: e.target.value })}
          className="mt-2 h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
        >
          {FONT_PAIRS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
    </Card>
  );
}

// ---- Step 3: Services template -------------------------------------

function Step3({
  state,
  patch,
}: {
  state: State;
  patch: (p: Partial<State>) => void;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Services
      </h2>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        Start from a template — the owner edits prices and adds more in
        /admin/settings.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(TEMPLATE_LABELS) as Array<State["serviceTemplate"]>).map(
          (tpl) => {
            const selected = state.serviceTemplate === tpl;
            return (
              <li key={tpl}>
                <button
                  type="button"
                  onClick={() => patch({ serviceTemplate: tpl })}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-[14px] border-[0.5px] px-4 py-3 text-left transition-colors duration-200 ease-ios",
                    selected
                      ? "border-sage bg-sage/10"
                      : "border-hairline-strong bg-white hover:bg-cream-deep/40"
                  )}
                >
                  <p
                    className={cn(
                      "text-[14px] font-medium tracking-snug",
                      selected ? "text-sage-deep" : "text-olive"
                    )}
                  >
                    {TEMPLATE_LABELS[tpl]}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                    {TEMPLATE_BLURBS[tpl]}
                  </p>
                </button>
              </li>
            );
          }
        )}
      </ul>
    </Card>
  );
}

// ---- Step 4: Working hours ----------------------------------------

function Step4() {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Working hours
      </h2>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        We&rsquo;ll start with the platform default — Mon-Fri 9-18, Saturday
        10-16, Sunday closed. Per-staff hours are configured by the owner
        in /admin/settings → Working hours after they sign in.
      </p>
      <div className="mt-4 rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/40 p-4">
        <ul className="grid grid-cols-1 gap-1 text-[13px] tracking-snug text-olive sm:grid-cols-2">
          <li>Monday: 9:00 – 18:00</li>
          <li>Tuesday: 9:00 – 18:00</li>
          <li>Wednesday: 9:00 – 18:00</li>
          <li>Thursday: 9:00 – 18:00</li>
          <li>Friday: 9:00 – 18:00</li>
          <li>Saturday: 10:00 – 16:00</li>
          <li className="text-olive-soft">Sunday: closed</li>
        </ul>
      </div>
    </Card>
  );
}

// ---- Step 5: Done --------------------------------------------------

function Step5({ state }: { state: State }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-sage-deep">
        Done
      </p>
      <h2 className="mt-2 font-serif text-[24px] font-medium leading-tight tracking-tight text-olive">
        {state.name} is live ✨
      </h2>
      <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
        We&rsquo;ve emailed {state.ownerEmail} with their sign-in link.
      </p>
      {state.resultUrl && (
        <div className="mt-4 rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/40 px-3 py-2 font-mono text-[13px] tracking-snug text-olive">
          {state.resultUrl}
        </div>
      )}
      <p className="mt-4 text-[12px] tracking-snug text-olive-soft">
        Once they sign in, they can set up staff, working hours, and a
        custom domain in /admin/settings.
      </p>
      <div className="mt-5 flex gap-2">
        <a
          href={state.resultUrl ?? "/admin"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-sage px-4 py-2 text-[13px] font-medium text-cream hover:bg-sage-deep"
        >
          Open the studio
        </a>
        <a
          href="/onboard"
          className="inline-flex items-center justify-center rounded-md border-[0.5px] border-hairline-strong bg-white px-4 py-2 text-[13px] font-medium text-olive hover:bg-cream-deep"
        >
          Onboard another
        </a>
      </div>
    </Card>
  );
}

// ---- Live preview --------------------------------------------------

function PreviewCard({
  state,
  fontPair,
}: {
  state: State;
  fontPair: { heading: string; body: string };
}) {
  const primaryOnBg = contrastRatio(state.primaryHex, state.backgroundHex);
  const textOnBg = contrastRatio(state.textHex, state.backgroundHex);
  const lowContrast = primaryOnBg < 3.0 || textOnBg < 4.5;

  return (
    <div className="overflow-hidden rounded-[14px] border-[0.5px] border-hairline bg-white">
      <p className="border-b-[0.5px] border-hairline px-4 py-3 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        Live preview · portal home
      </p>
      <div
        className="px-4 py-4"
        style={{
          background: state.backgroundHex,
          color: state.textHex,
          fontFamily: `'${fontPair.body}', system-ui, sans-serif`,
        }}
      >
        <p
          className="text-[20px] leading-tight tracking-tight"
          style={{
            fontFamily: `'${fontPair.heading}', Georgia, serif`,
            fontWeight: 500,
            color: state.textHex,
          }}
        >
          {state.name || "Your studio"}
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{ color: state.textHex, opacity: 0.65 }}
        >
          Saturday, 12 May
        </p>
        <button
          type="button"
          disabled
          className="mt-3 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: state.primaryHex,
            color: state.backgroundHex,
            fontFamily: `'${fontPair.body}', system-ui, sans-serif`,
          }}
        >
          Book a session
        </button>
        <span
          className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{
            background: `${state.accentHex}1f`,
            color: state.accentHex,
          }}
        >
          Insider
        </span>
      </div>
      {lowContrast && (
        <p className="border-t-[0.5px] border-hairline bg-destructive/10 px-4 py-2 text-[11px] tracking-snug text-destructive">
          Low contrast — fails WCAG AA. Body needs ≥4.5:1, primary ≥3:1.
        </p>
      )}
    </div>
  );
}

// ---- Field helpers -------------------------------------------------

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-16 cursor-pointer rounded-[12px] border-[0.5px] border-hairline-strong bg-white p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="#5C6B4E"
          className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 font-mono text-[13px] tabular-nums text-olive shadow-1"
        />
      </div>
    </Field>
  );
}

// PreviewCard receives state.tenant via the outer state — kept simple
// rather than adding tenantName as a separate prop.
type _Force = State; // satisfy noUnusedLocals hints in some configs
export type _Onboard = _Force;
