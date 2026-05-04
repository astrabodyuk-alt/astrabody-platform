import { redirect } from "next/navigation";
import { ChatClient } from "./ChatClient";
import {
  getOrCreateClientThread,
  isAnyStaffActive,
} from "./actions";
import { getPortalContext } from "@/lib/portal/booking-queries";

/**
 * Single-thread chat between the portal client and the studio.
 *
 * Server component: resolves the thread (creating it on first open with
 * a welcome bot message), loads the message history, and checks whether
 * any staff is active right now. The interactive surface is delegated
 * to ChatClient, which subscribes to Realtime postgres_changes.
 */
export default async function PortalChatPage() {
  let portal;
  try {
    portal = await getPortalContext();
  } catch {
    redirect("/portal/login");
  }

  const [thread, staffActive] = await Promise.all([
    getOrCreateClientThread(),
    isAnyStaffActive(portal.tenantId),
  ]);

  return (
    <ChatClient
      threadId={thread.threadId}
      initialMessages={thread.messages}
      staffActiveAtLoad={staffActive}
    />
  );
}
