import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getActiveProductsForTenant, getCurrentClientTier } from "@/lib/shop/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminSupabase();
    const { data: link } = await admin
      .from("client_portal_links")
      .select("client_id, clients (tenant_id)")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!link) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientId = link.client_id as string;
    type Embed = { tenant_id: string } | { tenant_id: string }[] | null;
    const tenantRow = link.clients as Embed;
    const tenantId = Array.isArray(tenantRow) ? tenantRow[0]?.tenant_id : tenantRow?.tenant_id;
    if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [products, tier] = await Promise.all([
      getActiveProductsForTenant(tenantId),
      getCurrentClientTier(clientId),
    ]);

    return NextResponse.json({ products, tier });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
