"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Subtle install prompt banner. Two channels:
 *
 *   1. Chromium browsers fire `beforeinstallprompt` — we capture the event,
 *      and the "Install" button calls event.prompt() then awaits userChoice.
 *
 *   2. iOS Safari has no event for this. Detect by user-agent + standalone
 *      flag and show instructional copy ("Tap [Share], then [Add to Home
 *      Screen]"). Single "Got it" dismisses for 14 days.
 *
 * Triggers (any one):
 *   - Three distinct /portal/* routes visited in this session.
 *   - "ax:install-trigger" custom event (high-engagement moments —
 *     bookings, first chat message — fire this; wired in V2).
 *
 * Suppression: localStorage `ax-install-dismissed-at` carries an epoch
 * timestamp; the banner stays hidden until that point.
 *
 * Layout per design DNA: cream-deep card, 0.5 px hairline-strong, 22 px
 * radius, p-4, fixed `bottom-[100px]` (above the 86 px BottomNav), z-30
 * (under the BottomNav's z-40 — they don't overlap, but stacking matches
 * the spec). No glass per §3.8.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SUPPRESS_KEY = "ax-install-dismissed-at";
const VISITED_KEY = "ax-portal-visited";
const SUPPRESS_DAYS = 14;

export function InstallBanner() {
  const pathname = usePathname() ?? "";

  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"chrome" | "ios" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<
    BeforeInstallPromptEvent | null
  >(null);
  const [triggered, setTriggered] = useState(false);

  // Capture beforeinstallprompt + decide iOS path.
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandalone()) return;
    if (isSuppressed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode("chrome");
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIosSafari() && !isStandalone()) {
      setMode("ios");
    }

    const triggerHandler = () => setTriggered(true);
    window.addEventListener("ax:install-trigger", triggerHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("ax:install-trigger", triggerHandler);
    };
  }, []);

  // Track distinct /portal/* routes visited this session.
  useEffect(() => {
    if (!pathname.startsWith("/portal") || pathname === "/portal/login") return;
    if (typeof window === "undefined") return;

    let visited: string[] = [];
    try {
      visited = JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? "[]");
    } catch {
      visited = [];
    }
    if (!visited.includes(pathname)) {
      visited.push(pathname);
      sessionStorage.setItem(VISITED_KEY, JSON.stringify(visited));
    }
    if (visited.length >= 3) setTriggered(true);
  }, [pathname]);

  useEffect(() => {
    if (triggered && mode) setShow(true);
  }, [triggered, mode]);

  function dismiss(persistDays = SUPPRESS_DAYS) {
    setShow(false);
    if (typeof window === "undefined") return;
    const until = Date.now() + persistDays * 24 * 60 * 60 * 1000;
    localStorage.setItem(SUPPRESS_KEY, String(until));
  }

  async function installChrome() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setShow(false);
    setDeferredPrompt(null);
    if (outcome === "dismissed") {
      // Suppress for the session only — Chrome will refire the event later.
      sessionStorage.setItem(SUPPRESS_KEY, "1");
    }
  }

  if (!show || !mode) return null;

  return (
    <div className="fixed inset-x-0 bottom-[100px] z-30 mx-3 flex justify-center">
      <div
        role="dialog"
        aria-label="Install Astrabody"
        className="w-full max-w-[456px] rounded-lg border-[0.5px] border-hairline-strong bg-cream-deep p-4 shadow-2"
      >
        {mode === "chrome" ? (
          <ChromeContent
            onInstall={installChrome}
            onDismiss={() => dismiss(SUPPRESS_DAYS)}
          />
        ) : (
          <IosContent onDismiss={() => dismiss(SUPPRESS_DAYS)} />
        )}
      </div>
    </div>
  );
}

function ChromeContent({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-[16px] font-medium leading-tight tracking-tight text-olive">
        Install Astrabody on your phone
      </h3>
      <p className="text-[12px] tracking-snug text-olive-soft">
        One tap to add it to your home screen. No app store.
      </p>
      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Not now
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={onInstall}>
          Install
        </Button>
      </div>
    </div>
  );
}

function IosContent({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-[16px] font-medium leading-tight tracking-tight text-olive">
        Install Astrabody on your iPhone
      </h3>
      <p className="text-[12px] tracking-snug text-olive-soft">
        Tap the <Hint>Share</Hint> icon below, then <Hint>Add to Home Screen</Hint>.
      </p>
      <div className="mt-1 flex items-center justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-olive-soft">
      {children}
    </span>
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari non-standard property.
  const navAny = navigator as Navigator & { standalone?: boolean };
  return navAny.standalone === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/iPad|iPhone|iPod/.test(ua)) return false;
  // Exclude Chrome on iOS (CriOS) and Firefox on iOS (FxiOS), which use
  // WebKit but don't have the same Add-to-Home-Screen UI.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  return true;
}

function isSuppressed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = localStorage.getItem(SUPPRESS_KEY);
    if (ls && parseInt(ls, 10) > Date.now()) return true;
    if (sessionStorage.getItem(SUPPRESS_KEY)) return true;
  } catch {
    // private mode, ignore
  }
  return false;
}
