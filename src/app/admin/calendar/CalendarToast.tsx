"use client";

import { useEffect, useState } from "react";

/**
 * Tiny toast that surfaces ?connected=1 / ?disconnected=1 / ?error=...
 * after the OAuth callback. Auto-dismisses after 4 seconds.
 *
 * Apple-canon: white surface, hairline border, shadow-2, rounded-lg,
 * fixed top-right inside the page column.
 */
export function CalendarToast({
  connected,
  disconnected,
  error,
}: {
  connected: boolean;
  disconnected: boolean;
  error: string | null;
}) {
  const [show, setShow] = useState<boolean>(connected || disconnected || !!error);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(id);
  }, [show]);

  if (!show) return null;

  let title = "";
  let body = "";
  let isError = false;

  if (connected) {
    title = "Connected ✨";
    body = "Astrabody bookings will now show up in your Google Calendar.";
  } else if (disconnected) {
    title = "Disconnected";
    body = "We're no longer reading or writing your Google Calendar.";
  } else if (error) {
    isError = true;
    title = "Couldn't connect";
    body = humaniseError(error);
  }

  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-50 max-w-[360px] rounded-lg border-[0.5px] border-hairline bg-white p-4 shadow-2"
    >
      <p className="font-serif text-[16px] font-medium leading-tight tracking-tight text-olive">
        {title}
      </p>
      <p
        className={`mt-1 text-[13px] tracking-snug ${
          isError ? "text-destructive" : "text-olive-soft"
        }`}
      >
        {body}
      </p>
    </div>
  );
}

function humaniseError(code: string): string {
  switch (code) {
    case "no_staff_record":
      return "You don't have a staff record yet. Ask Nigel to add you.";
    case "missing_params":
      return "The callback was missing parameters. Try connecting again.";
    case "bad_state":
      return "The connection state expired. Try connecting again.";
    case "staff_mismatch":
      return "This OAuth flow was started by a different account.";
    case "token_exchange":
      return "Google wouldn't issue tokens. Try once more.";
    case "no_refresh_token":
      return "Google didn't send a refresh token. Revoke this app's access on myaccount.google.com, then reconnect.";
    case "persist_failed":
      return "We got the tokens but couldn't save them. Try again.";
    case "access_denied":
      return "You declined the consent screen.";
    default:
      return code;
  }
}
