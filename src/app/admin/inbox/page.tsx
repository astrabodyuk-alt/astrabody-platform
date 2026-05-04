import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { InboxClient } from "./InboxClient";

/**
 * /admin/inbox — chat inbox.
 *
 * Two-pane layout: thread list left (260 px), conversation right.
 * URL state: ?thread=<id> opens that thread on load. Click a row →
 * push the URL.
 *
 * V1 doesn't subscribe to Realtime on the admin side (the client side
 * already gets staff messages via Realtime from Prompt 5). Refresh on
 * send is enough for staff. V2 TODO: add Realtime here for live updates
 * across multiple staff sessions.
 */
export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const { data: threads } = await supabase
    .from("chat_threads")
    .select(
      "id, channel, status, last_message_at, last_message_preview, unread_count_staff, " +
        "clients (id, full_name, email, phone)"
    )
    .eq("tenant_id", ctx.tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  let messages: Array<MessageRow> = [];
  let activeThreadId: string | null = null;
  if (params.thread) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", params.thread)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (thread) {
      activeThreadId = thread.id as string;
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select(
          "id, thread_id, sender_client_id, sender_staff_id, author_type, body, delivered_at, read_at, created_at"
        )
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: true });
      messages = (msgs ?? []) as MessageRow[];
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Inbox
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Chat with clients across the platform and the WhatsApp bot.
        </p>
      </header>

      <InboxClient
        threads={(threads ?? []) as unknown as ThreadRow[]}
        activeThreadId={activeThreadId}
        initialMessages={messages}
      />
    </div>
  );
}

export interface ThreadRow {
  id: string;
  channel: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_staff: number | null;
  clients: unknown;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  sender_client_id: string | null;
  sender_staff_id: string | null;
  author_type: "client" | "staff" | "bot" | "system";
  body: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}
