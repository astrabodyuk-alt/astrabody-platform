"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { ensurePushSubscription } from "@/lib/web-push/client";
import { updateClientProfile } from "./actions";

/**
 * /portal/me settings sub-section.
 *
 *   - Edit your name (clients.full_name)
 *   - Marketing opt-in (clients.marketing_opt_in) — Apple-style toggle
 *   - Birthday (clients.birth_date) — once set, the platform credits 500
 *     pts on that date each year.
 *   - Sign out — runs supabase.auth.signOut() in the browser then
 *     redirects to /portal/login.
 */
export function SettingsSection({
  initialFullName,
  initialMarketingOptIn,
  initialBirthDate,
}: {
  initialFullName: string;
  initialMarketingOptIn: boolean;
  initialBirthDate: string | null;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [marketing, setMarketing] = useState(initialMarketingOptIn);
  const [birthday, setBirthday] = useState(initialBirthDate ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savedFlag, setSavedFlag] = useState<"name" | "marketing" | "birthday" | null>(null);

  async function saveName() {
    setSavingName(true);
    const result = await updateClientProfile({ full_name: fullName });
    setSavingName(false);
    if (result.ok) {
      setSavedFlag("name");
      router.refresh();
      setTimeout(() => setSavedFlag(null), 1500);
    }
  }

  async function toggleMarketing() {
    const next = !marketing;
    setMarketing(next);
    const result = await updateClientProfile({ marketing_opt_in: next });
    if (result.ok) {
      setSavedFlag("marketing");
      setTimeout(() => setSavedFlag(null), 1500);
    } else {
      // revert on failure
      setMarketing(!next);
    }
  }

  async function saveBirthday(date: string) {
    setBirthday(date);
    const result = await updateClientProfile({ birth_date: date || null });
    if (result.ok) {
      setSavedFlag("birthday");
      setTimeout(() => setSavedFlag(null), 1500);
    }
  }

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    window.location.assign("/portal/login");
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      {/* Name */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Your name
        </span>
        <div className="flex items-center gap-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Sarah Reid"
            className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={saveName}
            disabled={savingName || fullName === initialFullName}
          >
            {savingName ? "Saving" : savedFlag === "name" ? "Saved ✓" : "Save"}
          </Button>
        </div>
      </div>

      <Divider />

      {/* Marketing opt-in */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[14px] font-medium tracking-snug text-olive">
            Marketing opt-in
          </span>
          <span className="text-[12px] tracking-snug text-olive-soft">
            Occasional Astrabody updates by email. Always quiet.
          </span>
        </div>
        <Toggle checked={marketing} onChange={toggleMarketing} />
      </div>

      <Divider />

      {/* Birthday */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Birthday
        </span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={birthday}
            onChange={(e) => saveBirthday(e.target.value)}
            className="h-11 flex-1 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1 placeholder:text-olive-faint"
          />
          {savedFlag === "birthday" && (
            <span className="text-[11px] font-medium uppercase tracking-label-caps text-sage">
              Saved ✓
            </span>
          )}
        </div>
        <span className="text-[11px] tracking-snug text-olive-faint">
          We&rsquo;ll credit 500 pts on the day, every year.
        </span>
      </div>

      <Divider />

      {/* Notifications */}
      <NotificationsRow />

      <Divider />

      {/* Sign out */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="text-olive-soft hover:text-destructive"
        >
          Sign out
        </Button>
      </div>
    </Card>
  );
}

function NotificationsRow() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  async function handleToggle() {
    if (busy || permission === "unsupported") return;
    if (permission === "denied") return;

    setBusy(true);
    const result = await ensurePushSubscription({ promptIfDefault: true });
    setBusy(false);

    if (result.ok) {
      setPermission("granted");
    } else if (result.reason === "denied") {
      setPermission("denied");
    }
  }

  const on = permission === "granted";
  const subCopy = (() => {
    if (permission === "unsupported") {
      return "Your browser doesn't support push notifications.";
    }
    if (permission === "denied") {
      return "Blocked. Open your browser settings to re-enable.";
    }
    if (permission === "granted") {
      return "On. You'll hear from us when it matters.";
    }
    return "We'll let you know when Tove or Jade reply. Tap to allow.";
  })();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-[14px] font-medium tracking-snug text-olive">
          Notifications
        </span>
        <span className="text-[12px] tracking-snug text-olive-soft">
          {subCopy}
        </span>
      </div>
      <Toggle
        checked={on}
        onChange={handleToggle}
        disabled={busy || permission === "unsupported" || permission === "denied"}
        label="Notifications"
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? "Toggle"}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative h-[31px] w-[51px] flex-shrink-0 overflow-hidden rounded-full transition-colors duration-200 ease-ios disabled:opacity-40",
        checked ? "bg-sage" : "bg-[#DDD8D0]"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 ease-ios",
          "shadow-[0_2px_5px_rgba(0,0,0,0.20)]",
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}

function Divider() {
  return <div className="h-px w-full bg-hairline" aria-hidden />;
}
