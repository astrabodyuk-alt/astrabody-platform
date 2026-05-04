import { redirect } from "next/navigation";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { NewSaleClient, type PackOption, type StaffOption } from "./NewSaleClient";

/**
 * /admin/sales/new — three-step wizard. Mobile-first, single column.
 *
 *   Step 1 — pick / create client
 *   Step 2 — pick a pack
 *   Step 3 — confirm sale (sold-by, payment method, amount, ref, notes)
 *
 * The whole thing renders in NewSaleClient; this server file just feeds
 * it the active packs catalogue, the staff list, and the current
 * staff's identity so step 3 can default Sold-by sensibly.
 *
 * `?clientId=<id>` (optional): pre-fill step 1 with that client and
 * skip the picker (used by the "Sell another pack" link on the client
 * detail page).
 */
export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const [packsResult, staffResult, prefilledClient] = await Promise.all([
    supabase
      .from("service_packages")
      .select(
        "id, name, short_description, sessions_count, price_pence, validity_months, " +
          "services:service_id (name)"
      )
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("staff")
      .select("id, display_name")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    params.clientId
      ? supabase
          .from("clients")
          .select("id, full_name, email, phone, tenant_id")
          .eq("id", params.clientId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const packs = ((packsResult.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    short_description: string | null;
    sessions_count: number;
    price_pence: number;
    validity_months: number;
    services: { name: string } | { name: string }[] | null;
  }>).map((p) => {
    const svc = Array.isArray(p.services) ? p.services[0] : p.services;
    return {
      id: p.id,
      name: p.name,
      short_description: p.short_description,
      sessions_count: p.sessions_count,
      price_pence: p.price_pence,
      validity_months: p.validity_months,
      service_name: svc?.name ?? "",
    } as PackOption;
  });

  const staff = (staffResult.data ?? []) as StaffOption[];

  let initialClient: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null = null;
  if (prefilledClient.data) {
    const c = prefilledClient.data as {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      tenant_id: string;
    };
    if (c.tenant_id !== ctx.tenantId) redirect("/admin/sales/new");
    initialClient = {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
    };
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          New sale
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Record an in-studio pack purchase &middot; ring it up on the spot.
        </p>
      </header>

      <NewSaleClient
        packs={packs}
        staff={staff}
        defaultStaffId={ctx.staffId}
        canPickAnyStaff={ctx.isOwnerOrAdmin}
        initialClient={initialClient}
      />
    </div>
  );
}
