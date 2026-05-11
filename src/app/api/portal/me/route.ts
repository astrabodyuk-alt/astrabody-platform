import { NextResponse } from "next/server";
import { getCurrentClient, getLoyaltyAccount } from "@/lib/portal/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { getReferralSummary } from "@/lib/referrals/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentClient().catch(() => null);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = await createServerSupabase();
    const [
      loyalty,
      ledgerResult,
      rewardsResult,
      profileResult,
      tenantResult,
      referralSummary,
      pastBookingsResult,
    ] = await Promise.all([
      getLoyaltyAccount(me.id),
      supabase
        .from("loyalty_ledger")
        .select("id, delta_points, reason, display_label, created_at")
        .eq("client_id", me.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("loyalty_rewards")
        .select("id, slug, name, description, kind, cost_points, value_pence, percent_value, service_id, min_tier")
        .eq("tenant_id", me.tenant_id)
        .eq("is_active", true)
        .order("cost_points", { ascending: true }),
      supabase
        .from("clients")
        .select("full_name, marketing_opt_in, birth_date, preferred_start_hour, preferred_end_hour")
        .eq("id", me.id)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("name, slug, subdomain, custom_domain, referral_enabled, referral_referrer_pence, referral_referred_pence")
        .eq("id", me.tenant_id)
        .maybeSingle(),
      getReferralSummary(me.id, me.tenant_id),
      supabase
        .from("bookings")
        .select(
          "id, starts_at, status, service_id, staff_id, " +
          "services (name, duration_min), " +
          "staff:staff_id (display_name, is_active)"
        )
        .eq("client_id", me.id)
        .in("status", ["completed", "confirmed"])
        .lt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: false })
        .limit(8),
    ]);

    return NextResponse.json({
      clientId: me.id,
      tenantId: me.tenant_id,
      firstName: me.firstName,
      loyalty,
      ledger: ledgerResult.data ?? [],
      rewards: rewardsResult.data ?? [],
      profile: profileResult.data ?? null,
      tenant: tenantResult.data ?? null,
      referralSummary,
      pastBookings: pastBookingsResult.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
