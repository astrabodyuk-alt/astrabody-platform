"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Cake,
  Mail,
  Clock,
  Bell,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { ensurePushSubscription } from "@/lib/web-push/client";
import { updateClientProfile } from "./actions";
import { Toggle } from "@/components/ui/toggle";

/**
 * /portal/me settings — redesigned as proper app-style rows.
 *
 * Three section groups (like iOS Settings / Airbnb):
 *   PROFILE     — name (tap-to-edit), birthday
 *   PREFERENCES — marketing toggle, preferred hours, notifications
 *   ACCOUNT     — sign out
 */
export function SettingsSection({
  initialFullName,
  initialMarketingOptIn,
  initialBirthDate,
  initialPreferredStartHour,
  initialPreferredEndHour,
}: {
  initialFullName: string;
  initialMarketingOptIn: boolean;
  initialBirthDate: string | null;
  initialPreferredStartHour: number | null;
  initialPreferredEndHour: number | null;
}) {
  const router = useRouter();

  // ── state ──────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(initialFullName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [marketing, setMarketing] = useState(initialMarketingOptIn);
  const [birthday, setBirthday] = useState(initialBirthDate ?? "");
  const [prefStart, setPrefStart] = useState<number | null>(initialPreferredStartHour);
  const [prefEnd, setPrefEnd] = useState<number | null>(initialPreferredEndHour);

  // Focus name input when edit mode opens
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // ── handlers ───────────────────────────────────────────────────
  async function saveName() {
    if (fullName === initialFullName) { setEditingName(false); return; }
    setSavingName(true);
    const result = await updateClientProfile({ full_name: fullName });
    setSavingName(false);
    if (result.ok) { router.refresh(); setEditingName(false); }
  }

  async function toggleMarketing() {
    const next = !marketing;
    setMarketing(next);
    const result = await updateClientProfile({ marketing_opt_in: next });
    if (!result.ok) setMarketing(!next); // revert on failure
  }

  async function saveBirthday(date: string) {
    setBirthday(date);
    await updateClientProfile({ birth_date: date || null });
  }

  async function savePreferredHours(start: number | null, end: number | null) {
    await updateClientProfile({ preferred_start_hour: start, preferred_end_hour: end });
  }

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    window.location.assign("/portal/login");
  }

  // ── derived labels ─────────────────────────────────────────────
  const birthdayLabel = birthday
    ? new Date(`${birthday}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric", month: "long",
      })
    : null;

  const hoursLabel =
    prefStart != null && prefEnd != null
      ? `${formatHour(prefStart)} – ${formatHour(prefEnd)}`
      : null;

  // ── render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── PROFILE ─────────────────────────────────────────── */}
      <Section title="Profile">
        {/* Name row */}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => !editingName && setEditingName(true)}
            className={cn(
              "flex w-full items-center gap-4 px-4 py-3.5 transition-colors active:bg-cream-deep",
              editingName && "pointer-events-none"
            )}
          >
            <IconBox><User size={17} strokeWidth={1.5} /></IconBox>
            <span className="flex-1 text-left text-[15px] font-medium text-olive">
              Your name
            </span>
            {!editingName && (
              <>
                <span className="max-w-[140px] truncate text-[14px] text-olive-soft">
                  {fullName || "Add name"}
                </span>
                <ChevronRight size={16} strokeWidth={1.6} className="shrink-0 text-olive-faint" />
              </>
            )}
          </button>

          {editingName && (
            <div className="px-4 pb-4 pt-1">
              <input
                ref={nameInputRef}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                placeholder="Your full name"
                className="h-11 w-full rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint focus:outline-none focus:ring-1 focus:ring-sage/40"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={saveName}
                  disabled={savingName}
                  className="h-9 flex-1 rounded-full bg-sage text-[13px] font-medium text-cream disabled:opacity-50"
                >
                  {savingName ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => { setFullName(initialFullName); setEditingName(false); }}
                  className="h-9 flex-1 rounded-full border border-hairline-strong text-[13px] font-medium text-olive-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <RowDivider />

        {/* Birthday row */}
        <label className="flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors active:bg-cream-deep">
          <IconBox><Cake size={17} strokeWidth={1.5} /></IconBox>
          <span className="flex-1 text-[15px] font-medium text-olive">Birthday</span>
          <span className="text-[14px] text-olive-soft">
            {birthdayLabel ?? "Not set"}
          </span>
          {/* Native date input — invisible, positioned over the chevron */}
          <div className="relative shrink-0">
            <ChevronRight size={16} strokeWidth={1.6} className="text-olive-faint" />
            <input
              type="date"
              value={birthday}
              onChange={(e) => saveBirthday(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        </label>
        <p className="px-4 pb-3 text-[11px] tracking-snug text-olive-faint">
          We&rsquo;ll credit 500 pts on your birthday, every year.
        </p>
      </Section>

      {/* ── PREFERENCES ─────────────────────────────────────── */}
      <Section title="Preferences">
        {/* Marketing */}
        <div className="flex items-center gap-4 px-4 py-3.5">
          <IconBox><Mail size={17} strokeWidth={1.5} /></IconBox>
          <div className="flex-1">
            <p className="text-[15px] font-medium text-olive">Marketing updates</p>
            <p className="text-[12px] text-olive-soft">Occasional offers by email. Always quiet.</p>
          </div>
          <Toggle checked={marketing} onChange={toggleMarketing} label="Marketing updates" />
        </div>

        <RowDivider />

        {/* Preferred hours */}
        <div className="flex flex-col">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <IconBox><Clock size={17} strokeWidth={1.5} /></IconBox>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-olive">Preferred booking hours</p>
              <p className="text-[12px] text-olive-soft">
                {hoursLabel ?? "Highlight slots that fit your schedule"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 pb-4">
            <HourSelect
              value={prefStart}
              placeholder="From"
              onChange={(h) => { setPrefStart(h); savePreferredHours(h, prefEnd); }}
            />
            <span className="shrink-0 text-[12px] text-olive-soft">to</span>
            <HourSelect
              value={prefEnd}
              placeholder="Until"
              onChange={(h) => { setPrefEnd(h); savePreferredHours(prefStart, h); }}
            />
          </div>
        </div>

        <RowDivider />

        {/* Notifications */}
        <NotificationsRow />
      </Section>

      {/* ── ACCOUNT ─────────────────────────────────────────── */}
      <Section title="Account">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-4 px-4 py-3.5 transition-colors active:bg-cream-deep"
        >
          <IconBox destructive><LogOut size={17} strokeWidth={1.5} className="text-destructive" /></IconBox>
          <span className="flex-1 text-left text-[15px] font-medium text-destructive">Sign out</span>
        </button>
      </Section>

    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-olive-faint">
        {title}
      </p>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-[0.5px] ring-hairline-strong">
        {children}
      </div>
    </div>
  );
}

function IconBox({ children, destructive }: { children: React.ReactNode; destructive?: boolean }) {
  return (
    <div className={cn(
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
      destructive ? "bg-destructive/8 text-destructive" : "bg-sage/8 text-sage"
    )}>
      {children}
    </div>
  );
}

function RowDivider() {
  return <div className="ml-16 h-px bg-hairline" aria-hidden />;
}

function NotificationsRow() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported"); return;
    }
    setPermission(Notification.permission);
  }, []);

  async function handleToggle() {
    if (busy || permission === "unsupported" || permission === "denied") return;
    setBusy(true);
    const result = await ensurePushSubscription({ promptIfDefault: true });
    setBusy(false);
    if (result.ok) setPermission("granted");
    else if (result.reason === "denied") setPermission("denied");
  }

  const on = permission === "granted";
  const subCopy =
    permission === "unsupported" ? "Not supported in this browser." :
    permission === "denied"      ? "Blocked — re-enable in browser settings." :
    permission === "granted"     ? "On. We'll only message when it matters." :
                                   "Tap to allow. We keep it quiet.";

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <IconBox><Bell size={17} strokeWidth={1.5} /></IconBox>
      <div className="flex-1">
        <p className="text-[15px] font-medium text-olive">Notifications</p>
        <p className="text-[12px] text-olive-soft">{subCopy}</p>
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

// ── helpers ─────────────────────────────────────────────────────

function formatHour(h: number): string {
  if (h === 12) return "12pm";
  if (h === 0)  return "12am";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

const HOUR_OPTIONS: { value: number; label: string }[] = Array.from(
  { length: 14 },
  (_, i) => {
    const h = i + 8;
    return { value: h, label: formatHour(h) };
  }
);

function HourSelect({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (h: number | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
      className="h-10 flex-1 appearance-none rounded-xl border-[0.5px] border-hairline-strong bg-cream px-3 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage/40"
    >
      <option value="">{placeholder}</option>
      {HOUR_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
