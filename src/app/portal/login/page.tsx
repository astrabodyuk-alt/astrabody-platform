"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { bootstrapPortalLink } from "./actions";
import { cn } from "@/lib/utils";

type Step = "email" | "code";

/**
 * Portal login — dark premium redesign.
 *
 * Background: deep olive gradient. Frosted glass card.
 * Two steps, no magic link:
 *   1. Email form → Supabase sends 6-digit OTP.
 *   2. Code form → verifyOtp → bootstrap → /portal.
 *
 * Magic links were swapped out because Outlook/Gmail pre-fetch the link,
 * which consumes the single-use token before the user clicks.
 */
export default function PortalLoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Redirect if already authenticated
  useEffect(() => {
    createBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) window.location.replace("/portal");
      });
  }, []);

  // Cooldown countdown for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000
    );
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendOtp(toEmail: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: toEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    setCooldown(60);
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    const ok = await sendOtp(trimmed);
    if (ok) {
      setEmail(trimmed);
      setCode("");
      setStep("code");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (verifyError) {
      setBusy(false);
      setError("invalid_code");
      return;
    }
    try {
      await bootstrapPortalLink();
    } catch (err) {
      console.error("[login] bootstrap failed", err);
    }
    window.location.assign("/portal");
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    await sendOtp(email);
  }

  function handleReset() {
    setStep("email");
    setCode("");
    setError(null);
    setCooldown(0);
  }

  return (
    /* ── Full-screen dark gradient background ── */
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12"
      style={{
        background: "linear-gradient(160deg, #2e3d22 0%, #1a2215 55%, #111a0e 100%)",
      }}
    >
      {/* Subtle radial glow behind card */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(117,133,100,0.18) 0%, transparent 70%)",
        }}
      />

      {/* ── Wordmark ── */}
      <div className="relative mb-8 flex flex-col items-center gap-1">
        <h1
          className="font-serif text-[38px] font-light tracking-[0.08em] text-white"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Astrabody
        </h1>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-white/40">
          Sculpt &middot; Refine &middot; Transform
        </p>
      </div>

      {/* ── Glass card ── */}
      <div
        className="relative w-full max-w-[400px] overflow-hidden rounded-[24px] px-7 py-8"
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {step === "email" ? (
          <FormView
            email={email}
            onEmail={setEmail}
            onSubmit={handleEmailSubmit}
            sending={busy}
            errorMessage={error ?? undefined}
          />
        ) : (
          <CodeView
            email={email}
            code={code}
            onCode={setCode}
            onSubmit={handleVerify}
            verifying={busy}
            isInvalidCode={error === "invalid_code"}
            otherError={error && error !== "invalid_code" ? error : undefined}
            cooldown={cooldown}
            onResend={handleResend}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Footer */}
      <p className="relative mt-8 text-[11px] tracking-wide text-white/20">
        Your private portal &nbsp;&middot;&nbsp; Chandler&rsquo;s Ford
      </p>
    </div>
  );
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function FormView({
  email,
  onEmail,
  onSubmit,
  sending,
  errorMessage,
}: {
  email: string;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  errorMessage?: string;
}) {
  return (
    <>
      <h2 className="font-serif text-[26px] font-light leading-tight tracking-tight text-white">
        Welcome back
      </h2>
      <p className="mt-2 text-[14px] leading-snug text-white/50">
        Enter your email and we&rsquo;ll send you a 6-digit code. No password, ever.
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
        <DarkInput
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={sending}
          required
          autoComplete="email"
          inputMode="email"
        />
        <PrimaryButton type="submit" disabled={sending || !email.trim()}>
          {sending ? "Sending…" : "Send me a code"}
        </PrimaryButton>
        {errorMessage && (
          <p className="text-[12px] text-red-400">{errorMessage}</p>
        )}
      </form>
    </>
  );
}

function CodeView({
  email,
  code,
  onCode,
  onSubmit,
  verifying,
  isInvalidCode,
  otherError,
  cooldown,
  onResend,
  onReset,
}: {
  email: string;
  code: string;
  onCode: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  verifying: boolean;
  isInvalidCode: boolean;
  otherError?: string;
  cooldown: number;
  onResend: () => void;
  onReset: () => void;
}) {
  return (
    <>
      <h2 className="font-serif text-[26px] font-light leading-tight tracking-tight text-white">
        Check your inbox
      </h2>
      <p className="mt-2 text-[14px] leading-snug text-white/50">
        We sent a 6-digit code to{" "}
        <span className="font-medium text-white/70">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        <OtpInput value={code} onChange={onCode} disabled={verifying} />
        <PrimaryButton
          type="submit"
          disabled={code.length !== 6 || verifying}
        >
          {verifying ? "Signing in…" : "Sign in"}
        </PrimaryButton>
        {isInvalidCode && (
          <p className="text-center text-[13px] text-white/50">
            That code didn&rsquo;t work. Try again or request a new one.
          </p>
        )}
        {otherError && (
          <p className="text-center text-[12px] text-red-400">{otherError}</p>
        )}
      </form>

      <div className="mt-5 flex flex-col items-center gap-1">
        <GhostButton
          disabled={cooldown > 0 || verifying}
          onClick={onResend}
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </GhostButton>
        <GhostButton onClick={onReset} disabled={verifying}>
          Use a different email
        </GhostButton>
      </div>
    </>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function DarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-[14px] px-4 text-[14px] text-white placeholder:text-white/30",
        "border border-white/10 bg-white/8",
        "focus:border-sage/60 focus:outline-none focus:ring-1 focus:ring-sage/40",
        "disabled:opacity-40",
        props.className
      )}
      style={{ background: "rgba(255,255,255,0.07)", ...props.style }}
    />
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-12 w-full rounded-full text-[14px] font-medium tracking-wide text-cream",
        "transition-all duration-200",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "bg-sage hover:bg-sage/90 active:scale-[0.98]"
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="py-1 text-[13px] text-white/40 transition-colors hover:text-white/60 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ── OTP Input ────────────────────────────────────────────────────────────────

/**
 * Six-box numeric OTP input. Apple iOS 2FA-style.
 * `value` is the contiguous prefix of digits typed so far (0–6 chars).
 */
function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const idx = Math.min(value.length, 5);
    inputsRef.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function handleChange(_i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    if (value.length >= 6) return;
    const next = (value + digit).slice(0, 6);
    onChange(next);
    if (next.length < 6) {
      requestAnimationFrame(() => inputsRef.current[next.length]?.focus());
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (value.length === 0) return;
      e.preventDefault();
      const next = value.slice(0, -1);
      onChange(next);
      requestAnimationFrame(() =>
        inputsRef.current[Math.min(next.length, 5)]?.focus()
      );
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      e.preventDefault();
      inputsRef.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, 5);
      requestAnimationFrame(() => inputsRef.current[focusIdx]?.focus());
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          autoComplete="one-time-code"
          aria-label={`Digit ${i + 1} of 6`}
          className={cn(
            "h-14 w-12 rounded-[12px] text-center font-serif text-[24px] font-medium tabular-nums text-white",
            "border transition-all duration-150",
            "focus:outline-none disabled:opacity-40",
            digit
              ? "border-sage/60 bg-sage/12 shadow-[0_0_0_1px_rgba(117,133,100,0.4)]"
              : "border-white/12 bg-white/6"
          )}
          style={{
            background: digit ? "rgba(117,133,100,0.12)" : "rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}
