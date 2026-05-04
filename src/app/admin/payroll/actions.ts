"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";

/**
 * Mark every pending commission for a single staff member as paid.
 * Owner / admin only. Stamps paid_at + paid_by_user_id on the affected
 * rows so /admin/me's "Last paid" can group by paid_at timestamp.
 *
 * Returns the number of rows paid + the total amount in pence.
 */
export async function markPendingAsPaidForStaff(
  staffId: string
): Promise<
  | { ok: true; count: number; totalPence: number }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();

  // Validate staff is in this tenant.
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!staff || staff.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "staff not in your tenant" };
  }

  // Fetch pending rows first so we can return totals + an exact list to
  // stamp. (`.update().select()` would also work, kept explicit for the
  // count math.)
  const { data: pending, error: readErr } = await admin
    .from("commissions")
    .select("id, amount_pence")
    .eq("tenant_id", ctx.tenantId)
    .eq("staff_id", staffId)
    .eq("status", "pending");
  if (readErr) return { ok: false, error: readErr.message };
  if (!pending || pending.length === 0) {
    return { ok: true, count: 0, totalPence: 0 };
  }

  const ids = pending.map((r) => r.id as string);
  const totalPence = pending.reduce(
    (acc, r) => acc + ((r.amount_pence as number | null) ?? 0),
    0
  );

  const { error } = await admin
    .from("commissions")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by_user_id: ctx.userId,
    })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payroll");
  revalidatePath("/admin/me");
  return { ok: true, count: pending.length, totalPence };
}
