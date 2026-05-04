"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  emailDownloadLinkForPurchase,
  getDownloadUrlForPurchase,
} from "./actions";

/**
 * Big sage download button. Hits a server action each time so the
 * signed URL is always fresh + a download row is logged for forensics.
 *
 * On iOS Safari, anchor.click() with a signed URL whose
 * content-disposition=attachment correctly triggers a save dialog —
 * we intentionally avoid window.location.href here because Safari
 * sometimes opens the PDF inline instead.
 */
export function OrderClient({
  purchaseId,
  assetReady,
}: {
  purchaseId: string;
  assetReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailState, setEmailState] = useState<
    "idle" | "sending" | "sent"
  >("idle");

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const r = await getDownloadUrlForPurchase(purchaseId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const a = document.createElement("a");
      a.href = r.url;
      a.rel = "noopener";
      a.target = "_self";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function handleEmail() {
    setEmailState("sending");
    setError(null);
    startTransition(async () => {
      const r = await emailDownloadLinkForPurchase(purchaseId);
      if (!r.ok) {
        setError(r.error);
        setEmailState("idle");
        return;
      }
      setEmailState("sent");
      setTimeout(() => setEmailState("idle"), 4000);
    });
  }

  if (!assetReady) {
    return (
      <p className="text-[13px] tracking-snug text-olive-soft">
        The studio hasn&rsquo;t uploaded the file yet. We&rsquo;ll email
        you the moment it&rsquo;s ready.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="primary"
        className="w-full"
        onClick={handleDownload}
        disabled={pending}
      >
        {pending ? "One sec" : "Download PDF"}
      </Button>
      <p className="text-[12px] tracking-snug text-olive-soft">
        Available for 7 days. We&rsquo;ll keep your purchase on record
        forever — pop back any time and tap the button again to get a
        fresh link.
      </p>
      {error && (
        <p className="text-[12px] text-destructive">{error}</p>
      )}
      <div>
        {emailState === "sent" ? (
          <span className="text-[12px] tracking-snug text-sage-deep">
            Email sent ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={handleEmail}
            disabled={pending}
            className="text-[12px] font-medium tracking-snug text-sage-deep underline-offset-2 hover:underline disabled:opacity-50"
          >
            {emailState === "sending" ? "Sending" : "Email me the link"}
          </button>
        )}
      </div>
    </div>
  );
}
