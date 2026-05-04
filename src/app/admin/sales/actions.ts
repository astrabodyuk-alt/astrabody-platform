"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin/auth";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Create a walk-in client for an in-studio sale. No portal account
 * is provisioned — the client_portal_link is created later if/when the
 * client signs in via OTP. email is optional (some walk-ins haven't
 * given it yet); name is required.
 */
export async function createWalkinClient(input: {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  marketingConsent?: boolean;
}): Promise<Result<{ clientId: string }>> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "name is required" };

  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "invalid email" };
  }

  const admin = createAdminSupabase();

  // If an email is given and a client with that email already exists in
  // this tenant, return that one — staff probably forgot the client
  // already had a record.
  if (email) {
    const { data: existing } = await admin
      .from("clients")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("email", email)
      .maybeSingle();
    if (existing?.id) {
      return { ok: true, clientId: existing.id as string };
    }
  }

  const { data: created, error } = await admin
    .from("clients")
    .insert({
      tenant_id: ctx.tenantId,
      full_name: fullName,
      email,
      phone,
      marketing_opt_in: input.marketingConsent ?? false,
      source: "walk_in",
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "couldn't create client" };
  }

  revalidatePath("/admin/clients");
  return { ok: true, clientId: created.id as string };
}

/**
 * Record a pack sale: creates client_packages + package_purchases
 * (the trigger then issues the commission row). One transaction at the
 * action level — if the purchase row fails, we delete the client_package
 * we just created so we don't leave orphaned credit on the account.
 *
 * Permissions:
 *   - Anyone with role >= staff can record a sale.
 *   - Staff can only attribute the sale to themselves.
 *   - Owner / admin can attribute to any staff in the tenant.
 */
export async function createPackageSale(input: {
  clientId: string;
  packageId: string;
  soldByStaffId: string;
  amountPaidPence: number;
  paymentMethod:
    | "cash"
    | "card_terminal"
    | "bank_transfer"
    | "stripe_online"
    | "gift"
    | "other";
  reference?: string | null;
  notes?: string | null;
}): Promise<
  Result<{
    purchaseId: string;
    clientPackageId: string;
    commissionPence: number;
  }>
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  // Staff-level attribution check.
  if (!ctx.isOwnerOrAdmin && input.soldByStaffId !== ctx.staffId) {
    return {
      ok: false,
      error: "you can only record sales attributed to yourself",
    };
  }

  if (!Number.isFinite(input.amountPaidPence) || input.amountPaidPence < 0) {
    return { ok: false, error: "invalid amount" };
  }

  const admin = createAdminSupabase();

  // Validate the pack belongs to this tenant + is active.
  const { data: pkg } = await admin
    .from("service_packages")
    .select(
      "id, tenant_id, service_id, sessions_count, validity_months, is_active, name, price_pence"
    )
    .eq("id", input.packageId)
    .maybeSingle();
  if (!pkg || pkg.tenant_id !== ctx.tenantId || !pkg.is_active) {
    return { ok: false, error: "pack not available" };
  }

  // Validate client belongs to this tenant.
  const { data: client } = await admin
    .from("clients")
    .select("id, tenant_id, full_name")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client || client.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "client not in your tenant" };
  }

  // Validate sold-by staff belongs to this tenant + is active.
  const { data: staff } = await admin
    .from("staff")
    .select("id, tenant_id, is_active, commission_rate_pct")
    .eq("id", input.soldByStaffId)
    .maybeSingle();
  if (!staff || staff.tenant_id !== ctx.tenantId || !staff.is_active) {
    return { ok: false, error: "staff not in your tenant" };
  }

  const sessionsTotal = pkg.sessions_count as number;
  const validityMonths = pkg.validity_months as number;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + validityMonths);

  // Step 1 — create the credit row.
  const { data: cp, error: cpErr } = await admin
    .from("client_packages")
    .insert({
      tenant_id: ctx.tenantId,
      client_id: input.clientId,
      package_id: input.packageId,
      service_id: pkg.service_id,
      sessions_total: sessionsTotal,
      sessions_remaining: sessionsTotal,
      expires_at: expiresAt.toISOString(),
      status: "active",
    })
    .select("id")
    .single();
  if (cpErr || !cp) {
    return { ok: false, error: cpErr?.message ?? "couldn't credit pack" };
  }

  // Step 2 — record the purchase. This trigger inserts the commission.
  const { data: purchase, error: pErr } = await admin
    .from("package_purchases")
    .insert({
      tenant_id: ctx.tenantId,
      client_package_id: cp.id,
      package_id: input.packageId,
      client_id: input.clientId,
      sold_by_staff_id: input.soldByStaffId,
      amount_paid_pence: Math.round(input.amountPaidPence),
      payment_method: input.paymentMethod,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (pErr || !purchase) {
    // Roll back the credit row so we don't leave orphaned sessions.
    await admin.from("client_packages").delete().eq("id", cp.id);
    return { ok: false, error: pErr?.message ?? "couldn't record sale" };
  }

  // Read back the commission the trigger just inserted (for the
  // confirmation message).
  const { data: commission } = await admin
    .from("commissions")
    .select("amount_pence")
    .eq("package_purchase_id", purchase.id)
    .maybeSingle();
  const commissionPence = (commission?.amount_pence as number | undefined) ?? 0;

  revalidatePath("/admin/sales");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/me");
  revalidatePath(`/admin/clients/${input.clientId}`);
  return {
    ok: true,
    purchaseId: purchase.id as string,
    clientPackageId: cp.id as string,
    commissionPence,
  };
}

/**
 * Refund a pack sale. Owner / admin only. The trigger flips the
 * client_package to cancelled and voids the (unpaid) commission. We
 * deliberately don't restore consumed sessions — those bookings already
 * happened, only the future pack value is voided.
 */
export async function refundPackageSale(
  purchaseId: string,
  reason?: string
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (!ctx.isOwnerOrAdmin) return { ok: false, error: "owner / admin only" };

  const admin = createAdminSupabase();

  // Fetch the purchase to confirm tenant + non-refunded.
  const { data: purchase } = await admin
    .from("package_purchases")
    .select("id, tenant_id, refunded, notes")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.tenant_id !== ctx.tenantId) {
    return { ok: false, error: "sale not in your tenant" };
  }
  if (purchase.refunded) {
    return { ok: false, error: "already refunded" };
  }

  const reasonTrim = reason?.trim();
  const newNotes = reasonTrim
    ? [purchase.notes, `Refund reason: ${reasonTrim}`].filter(Boolean).join("\n")
    : purchase.notes;

  const { error } = await admin
    .from("package_purchases")
    .update({
      refunded: true,
      refunded_at: new Date().toISOString(),
      notes: newNotes,
    })
    .eq("id", purchaseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sales");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/me");
  return { ok: true };
}
