"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { bootstrapPortalLink } from "./actions";

type Step = "email" | "code";

/**
 * Portal login. Two steps, no magic link:
 *   1. Email form. Submits → Supabase sends a 6-digit OTP code.
 *   2. Code form. User pastes/types the code → verifyOtp → bootstrap → /portal.
 *
 * Magic links were swapped out because Outlook and Gmail were aggressively
 * pre-fetching the link, which consumes the single-use token before the
 * user clicks. OTP codes don't have that problem.
 */
export default function PortalLoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // If the client already has a valid session, skip the login form entirely.
  useEffect(() => {
    createBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) window.location.replace("/portal");
      });
  }, []);

  // Cooldown countdown for the resend button.
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
      // Non-blocking: the next /portal render will redirect back here if
      // the link genuinely wasn't created.
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
    <div className="px-6 pt-12">
      <p className="mb-10 text-center font-serif text-[18px] font-medium tracking-tight text-olive-soft">
        Astrabody
      </p>

      <Card className="mx-auto w-full max-w-[400px] p-8">
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
            otherError={
              error && error !== "invalid_code" ? error : undefined
            }
            cooldown={cooldown}
            onResend={handleResend}
            onReset={handleReset}
          />
        )}
      </Card>
    </div>
  );
}

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
      <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
        Welcome to Astrabody
      </h1>
      <p className="mt-3 text-[15px] tracking-snug text-olive-soft">
        We&rsquo;ll send you a 6-digit code. No password, ever.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={sending}
          required
          autoComplete="email"
          inputMode="email"
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={sending || !email.trim()}
        >
          {sending ? "Sending" : "Send me a code"}
        </Button>
        {errorMessage && (
          <p className="text-[12px] text-destructive">{errorMessage}</p>
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
      <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
        Enter the code we sent.
      </h1>
      <p className="mt-3 text-[15px] tracking-snug text-olive-soft">
        Check your inbox for a 6-digit code from Astrabody. Paste it below.
      </p>
      <p className="mt-1 text-[13px] tracking-snug text-olive-faint">
        Sent to <span className="font-medium text-olive-soft">{email}</span>
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <OtpInput value={code} onChange={onCode} disabled={verifying} />
        <Button
          type="submit"
          variant="primary"
          disabled={code.length !== 6 || verifying}
        >
          {verifying ? "Signing in" : "Sign in"}
        </Button>
        {isInvalidCode && (
          <p className="text-center text-[13px] tracking-snug text-olive-soft">
            That code didn&rsquo;t work. Try again or request a new one.
          </p>
        )}
        {otherError && (
          <p className="text-center text-[12px] text-destructive">
            {otherError}
          </p>
        )}
      </form>

      <div className="mt-6 flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cooldown > 0 || verifying}
          onClick={onResend}
        >
          {cooldown > 0
            ? `Send a new code in ${cooldown}s`
            : "Send me a new code"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={verifying}
        >
          Use a different email
        </Button>
      </div>
    </>
  );
}

/**
 * Six-box numeric OTP input. Apple iOS 2FA-style.
 * `value` is the contiguous prefix of digits typed so far (0–6 chars).
 * Out-of-order taps are tolerated: every typed digit is appended to the
 * prefix, focus follows the next-empty box. Paste fills all six.
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

  // Auto-focus the first empty box on mount.
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
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
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
          className="h-14 w-12 rounded-[12px] border-[0.5px] border-hairline-strong bg-white text-center font-serif text-[22px] font-medium tabular-nums text-olive shadow-1 disabled:opacity-50"
        />
      ))}
    </div>
  );
}
