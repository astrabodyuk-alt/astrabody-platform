"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Mint a comms proposal for a single lapsed client. Pre-fills the
 * draft so the owner sees the copy immediately without waiting for
 * the AI roundtrip — this is a one-shot personal nudge, not a campaign.
 *
 * Segment defaults to a one-off that matches no one in /admin/emails;
 * the owner can change it in the sheet before sending if they want a
 * broader cast.
 */
export async function createWinBackProposal(
  clientId: string
): Promise<Result<{ proposalId: string }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Owners and admins only." };
  }

  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from("clients")
    .select("id, full_name, tenant_id, last_booking_at")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Client not found." };
  }

  const firstName =
    ((client.full_name as string | null) ?? "").trim().split(/\s+/)[0] || "there";
  const lastVisitLabel = client.last_booking_at
    ? `since ${new Date(client.last_booking_at as string).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
      })}`
    : "for a while";

  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const tenantName =
    ((tenant?.name as string | null | undefined) ?? "the studio") || "the studio";

  const subject = `We miss you at ${tenantName}, ${firstName}`;
  const bodyMd = `Hi ${firstName},

It's been ${lastVisitLabel} — we've missed you at ${tenantName}.

We'd love to see you back. Book a session with us this week and we'll throw in a complimentary upgrade on us. 🌿

Just hit reply if you'd like a hand picking a time.

— ${tenantName}`;

  const { data: row, error } = await admin
    .from("comms_proposals")
    .insert({
      tenant_id: ctx.tenantId,
      trigger_kind: "win_back",
      trigger_ref_id: clientId,
      trigger_summary: `Win-back: ${client.full_name ?? firstName}`,
      draft_subject: subject,
      draft_body_md: bodyMd,
      default_segment: { type: "all" },
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Couldn't queue win-back." };
  }
  revalidatePath("/admin/emails");
  return { ok: true, proposalId: row.id as string };
}
