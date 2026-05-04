import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { ClientsTable } from "./ClientsTable";

/**
 * /admin/clients — paginated list with search + sort + lifetime points.
 *
 * V1 ships with TanStack Table client-side filtering / sorting on a
 * server-fetched page of up to 500 clients. V2 (when the tenant grows
 * past a few thousand clients) should switch to server-side pagination
 * via `range()` + a `q=` query param routed through PostgREST.
 */
export default async function AdminClientsPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();

  // Pull clients + their loyalty_accounts in one query so we get
  // tier + lifetime_points for the table.
  const { data } = await supabase
    .from("clients")
    .select(
      "id, full_name, email, phone, source, bookings_count, last_booking_at, " +
        "total_spend_pence, created_at, " +
        "loyalty_accounts (tier, lifetime_points, current_points)"
    )
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(500);

  type Raw = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    bookings_count: number | null;
    last_booking_at: string | null;
    total_spend_pence: number | null;
    loyalty_accounts: unknown;
  };
  const rows = ((data ?? []) as unknown as Raw[]).map((r) => {
    const acct = pickFirst<{
      tier: string;
      lifetime_points: number;
      current_points: number;
    }>(r.loyalty_accounts);
    return {
      id: r.id,
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      source: r.source ?? "",
      bookings_count: r.bookings_count ?? 0,
      last_booking_at: r.last_booking_at,
      total_spend_pence: r.total_spend_pence ?? 0,
      lifetime_points: acct?.lifetime_points ?? 0,
      tier: acct?.tier ?? "friend",
    };
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Clients
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {rows.length} client{rows.length === 1 ? "" : "s"} across the platform
          and bot.
        </p>
      </header>
      <ClientsTable rows={rows} />
    </div>
  );
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
