"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { UK_BANK_HOLIDAYS } from "@/lib/coach/uk-calendar";
import { createCommsProposal } from "@/lib/comms/proposal-actions";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Idempotently insert one row per upcoming UK bank holiday into
 * bank_holiday_decisions for the given tenant. Cheap to run on every
 * admin login — the unique (tenant_id, date) constraint short-circuits
 * any duplicates.
 */
export async function ensureBankHolidayDecisions(
  tenantId: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx || ctx.tenantId !== tenantId) {
    return { ok: false, error: "Not authorised." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = UK_BANK_HOLIDAYS.filter((h) => h.date >= today);
  if (upcoming.length === 0) return { ok: true };

  const admin = createAdminSupabase();
  const rows = upcoming.map((h) => ({
    tenant_id: tenantId,
    date: h.date,
    name: h.name,
  }));

  // ON CONFLICT DO NOTHING via the unique (tenant_id, date) index.
  const { error } = await admin
    .from("bank_holiday_decisions")
    .upsert(rows, {
      onConflict: "tenant_id,date",
      ignoreDuplicates: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Owner / admin marks a bank holiday as closed or open. When closed,
 * also writes a tenant_closures row (so availability reflects it) and
 * fires a comms proposal — the universal "Notify clients?" hook.
 */
export async function decideBankHoliday(input: {
  decisionId: string;
  decision: "closed" | "open";
}): Promise<Result<{ proposalId?: string }>> {
  const ctx = await getAdminContext();
  if (!ctx || !ctx.isOwnerOrAdmin) {
    return { ok: false, error: "Only owners and admins can decide." };
  }
  if (input.decision !== "closed" && input.decision !== "open") {
    return { ok: false, error: "Invalid decision." };
  }

  const admin = createAdminSupabase();
  const { data: row, error: readErr } = await admin
    .from("bank_holiday_decisions")
    .select("id, tenant_id, date, name")
    .eq("id", input.decisionId)
    .maybeSingle();
  if (readErr || !row || row.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "Decision not found." };
  }

  const decisionUpdate = await admin
    .from("bank_holiday_decisions")
    .update({
      decision: input.decision,
      decided_at: new Date().toISOString(),
      decided_by_user_id: ctx.userId,
    })
    .eq("id", input.decisionId)
    .eq("tenant_id", ctx.tenantId);
  if (decisionUpdate.error) {
    return { ok: false, error: decisionUpdate.error.message };
  }

  if (input.decision === "open") {
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return { ok: true };
  }

  // Closed → write the closure row + propose a client email.
  const { data: closure, error: closureErr } = await admin
    .from("tenant_closures")
    .insert({
      tenant_id: ctx.tenantId,
      starts_on: row.date as string,
      ends_on: row.date as string,
      reason: row.name as string,
      is_all_day: true,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .single();
  // A duplicate closure (e.g. seeded earlier from migration 019) is fine.
  if (closureErr && !closureErr.message.includes("duplicate")) {
    console.warn("[decideBankHoliday] closure insert failed", closureErr);
  }

  const proposal = await createCommsProposal({
    tenantId: ctx.tenantId,
    triggerKind: "bank_holiday_closure",
    triggerRefId: (closure?.id as string | undefined) ?? null,
    triggerSummary: `Closed on ${row.name} (${formatDateLabel(row.date as string)})`,
    defaultSegment: { type: "all" },
    createdByUserId: ctx.userId,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return {
    ok: true,
    proposalId: proposal.ok ? proposal.proposalId : undefined,
  };
}

function formatDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
