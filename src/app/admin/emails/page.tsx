import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { TemplatesTab } from "./TemplatesTab";
import { CampaignsTab } from "./CampaignsTab";
import { HistoryTab } from "./HistoryTab";
import { PendingAnnouncementsTab } from "./PendingAnnouncementsTab";

/**
 * /admin/emails — owner/admin gated.
 *
 *   Tab 1 — Templates (lifecycle copy, editable)
 *   Tab 2 — Campaigns (manual marketing broadcasts)
 *   Tab 3 — History (every email_sends row, latest first)
 */
export default async function AdminEmailsPage() {
  const ctx = await getAdminContextOrRedirect();
  if (!ctx.isOwnerOrAdmin) redirect("/admin");

  const supabase = await createServerSupabase();
  const [
    templatesResult,
    broadcastsResult,
    sendsResult,
    servicesResult,
    pendingProposalsResult,
  ] =
    await Promise.all([
      supabase
        .from("email_templates")
        .select(
          "id, slug, name, subject, body_md, trigger, trigger_offset_minutes, is_active, updated_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("trigger", { ascending: true })
        .order("slug", { ascending: true }),
      supabase
        .from("email_broadcasts")
        .select(
          "id, name, subject, body_md, segment_query, scheduled_at, sent_count, status, created_at, sent_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("email_sends")
        .select(
          "id, to_email, subject, status, sent_at, error, created_at, body_html, " +
            "email_templates:template_id (name, slug), " +
            "clients (full_name, email)"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("services")
        .select("id, name")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_bookable", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("comms_proposals")
        .select(
          "id, trigger_kind, trigger_summary, draft_subject, draft_body_md, " +
            "default_segment, status, created_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const templates = (templatesResult.data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    subject: string;
    body_md: string;
    trigger: string;
    trigger_offset_minutes: number | null;
    is_active: boolean;
    updated_at: string;
  }>;
  const broadcasts = (broadcastsResult.data ?? []) as Array<{
    id: string;
    name: string;
    subject: string;
    body_md: string;
    segment_query: unknown;
    scheduled_at: string | null;
    sent_count: number | null;
    status: string;
    created_at: string;
    sent_at: string | null;
  }>;
  const sends = (sendsResult.data ?? []) as unknown as Array<{
    id: string;
    to_email: string;
    subject: string;
    status: string;
    sent_at: string | null;
    error: string | null;
    created_at: string;
    body_html: string;
    email_templates:
      | { name: string; slug: string }
      | { name: string; slug: string }[]
      | null;
    clients:
      | { full_name: string | null; email: string | null }
      | { full_name: string | null; email: string | null }[]
      | null;
  }>;
  const services = (servicesResult.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const pendingProposals = (pendingProposalsResult.data ?? []) as unknown as Array<{
    id: string;
    trigger_kind: string;
    trigger_summary: string;
    draft_subject: string | null;
    draft_body_md: string | null;
    default_segment: unknown;
    status: string;
    created_at: string;
  }>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Emails
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Lifecycle templates, manual campaigns, and the audit log.
        </p>
      </header>

      <Tabs defaultValue={pendingProposals.length > 0 ? "pending" : "templates"}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending announcements
            {pendingProposals.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-medium tabular-nums text-cream">
                {pendingProposals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingAnnouncementsTab
            proposals={pendingProposals}
            services={services}
          />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab templates={templates} />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab broadcasts={broadcasts} services={services} />
        </TabsContent>
        <TabsContent value="history">
          {sends.length === 0 ? (
            <Card className="p-5">
              <p className="text-[13px] tracking-snug text-olive-soft">
                Nothing sent yet. Templates fire when their trigger
                conditions match (24h reminder, after-care, etc.).
                Campaigns appear here too.
              </p>
            </Card>
          ) : (
            <HistoryTab sends={sends} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
