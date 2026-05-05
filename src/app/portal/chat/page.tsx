import { AIChatClient } from "./AIChatClient";

/**
 * /portal/chat — AI assistant as the primary chat surface.
 * Human team chat is at /portal/chat/team.
 */
export default function PortalChatPage() {
  return <AIChatClient />;
}
