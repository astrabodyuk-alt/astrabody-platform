import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getServiceDetail,
  getDefaultStaffForService,
  getRedemptionForBooking,
  getPortalContext,
} from "@/lib/portal/booking-queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { getWalletForClient } from "@/lib/loyalty/wallet";
import { getActivePacksForClient } from "@/lib/portal/packs";
import {
  getCancellationPolicy,
  describePolicy,
} from "@/lib/finance/policy";
import { CheckoutClient } from "./CheckoutClient";

/**
 * Step 3 of 3 — Stripe-style checkout.
 *
 * NOTE on layout: this page intentionally breaks out of the parent
 * /portal layout's 480px column with a `fixed inset-0 z-50` overlay so
 * the desktop two-column form-plus-summary fits at ≥768px. The portal's
 * BottomNav (fixed z-40) is hidden behind the overlay; this is the
 * focused-checkout pattern (no in-app nav distractions while paying).
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{
    date?: string;
    time?: string;
    reward?: string;
    staff?: string;
    pack?: string;
    resource?: string;
  }>;
}) {
  const { serviceId } = await params;
  const {
    date,
    time,
    reward,
    staff: staffParam,
    pack: packParam,
    resource: resourceParam,
  } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = await getServiceDetail(serviceId);
  if (!service) notFound();

  if (!date || !time) {
    redirect(`/portal/book/${serviceId}`);
  }

  const startsAt = new Date(time);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    redirect(`/portal/book/${serviceId}`);
  }

  // Resolve the practitioner: an explicit staff_id takes priority,
  // falling back to the default staff if "any" / missing / invalid.
  let staff: { id: string; display_name: string; email: string | null } | null = null;
  let chosenStaffIdForAction: string | null = null;
  if (staffParam && staffParam !== "any") {
    const supabase2 = await createServerSupabase();
    const { data: link } = await supabase2
      .from("staff_services")
      .select("staff:staff_id (id, display_name, email, is_active)")
      .eq("service_id", serviceId)
      .eq("staff_id", staffParam)
      .maybeSingle();
    type Embed = {
      staff:
        | { id: string; display_name: string; email: string | null; is_active: boolean }
        | Array<{ id: string; display_name: string; email: string | null; is_active: boolean }>
        | null;
    };
    const embed = link as Embed | null;
    const row = embed
      ? Array.isArray(embed.staff)
        ? embed.staff[0]
        : embed.staff
      : null;
    if (row && row.is_active) {
      staff = { id: row.id, display_name: row.display_name, email: row.email };
      chosenStaffIdForAction = row.id;
    }
  }
  if (!staff) {
    staff = await getDefaultStaffForService(serviceId);
  }
  if (!staff) notFound();

  // If a free-service reward was redeemed before reaching here, validate
  // it and override price/deposit to 0. The CheckoutClient renders the
  // free-booking branch (no Stripe).
  let redemption: { id: string; rewardName: string } | null = null;
  if (reward) {
    const r = await getRedemptionForBooking(reward);
    if (r && r.available && r.serviceId === serviceId) {
      redemption = { id: r.id, rewardName: r.rewardName };
    } else if (r && !r.available) {
      // Redemption already used — kick the user back to the picker.
      redirect(`/portal/book/${serviceId}`);
    }
  }

  // Validate the pack id passed via the URL. Cheap defence in depth —
  // the booking action re-validates everything anyway, but failing
  // early here lets us skip rendering the pay form for a fully-free
  // pack-backed booking.
  const portalContext = await getPortalContext().catch(() => null);
  let consumedPack: {
    id: string;
    name: string;
    sessionsRemaining: number;
    sessionsTotal: number;
  } | null = null;
  if (packParam && portalContext) {
    const candidates = await getActivePacksForClient(portalContext.clientId);
    const match = candidates.find(
      (p) => p.id === packParam && p.serviceId === serviceId
    );
    if (match) {
      consumedPack = {
        id: match.id,
        name: match.name,
        sessionsRemaining: match.sessionsRemaining,
        sessionsTotal: match.sessionsTotal,
      };
    }
  }

  const effectivePricePence =
    consumedPack || redemption ? 0 : service.price_pence;
  const effectiveDepositPence =
    consumedPack || redemption ? 0 : service.deposit_pence;

  // Pull the wallet so the CheckoutClient can compute line items + the
  // discounted Stripe amount on the server-rendered first paint. Skipped
  // when consuming a pack — packs short-circuit the entire combiner.
  const wallet =
    portalContext && !consumedPack
      ? await getWalletForClient(portalContext.clientId)
      : { currentPoints: 0, vouchers: [] };

  // Cancellation policy — rendered above the Pay button so it's the
  // last thing the client reads before paying.
  const cancellationPolicy = await getCancellationPolicy(service.tenant_id);
  const policyLines = describePolicy(cancellationPolicy);

  // Saved-card status — drives the "Pay with •• 4242" express pill.
  let savedCard: {
    last4: string;
    brand: string;
  } | null = null;
  if (portalContext) {
    const supabaseAdmin = (await import("@/lib/supabase/admin")).createAdminSupabase();
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select(
        "default_payment_method_id, card_brand, card_last4"
      )
      .eq("id", portalContext.clientId)
      .maybeSingle();
    const pm =
      (clientRow?.default_payment_method_id as string | null) ?? null;
    const last4 = (clientRow?.card_last4 as string | null) ?? null;
    const brand = (clientRow?.card_brand as string | null) ?? null;
    if (pm && last4) {
      savedCard = { last4, brand: brand ?? "card" };
    }
  }

  const dateTimeLabel = formatDateTimeForHeader(startsAt);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-cream">
      <div className="mx-auto w-full max-w-[1024px] px-6 pt-8 pb-16 md:pt-12">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href={(() => {
              const p = new URLSearchParams({ date, time });
              if (reward) p.set("reward", reward);
              if (staffParam) p.set("staff", staffParam);
              return `/portal/book/${serviceId}?${p.toString()}`;
            })()}
            className="text-[13px] font-medium tracking-snug text-sage-deep"
          >
            ← Back
          </Link>
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Step 4 of 4
          </span>
        </div>

        <div className="mb-8">
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
            {redemption || consumedPack
              ? "Confirm your booking"
              : "Confirm and pay"}
          </h1>
          <p className="mt-3 text-[14px] tracking-snug text-olive-soft">
            {service.name} · {dateTimeLabel}
          </p>
          {redemption && (
            <p className="mt-1 text-[13px] tracking-snug text-sage">
              Redeeming: {redemption.rewardName} ✨
            </p>
          )}
          {consumedPack && (
            <p className="mt-1 text-[13px] tracking-snug text-sage">
              Using 1 session from your {consumedPack.name} (
              {consumedPack.sessionsRemaining} left) ✨
            </p>
          )}
        </div>

        <CheckoutClient
          serviceId={serviceId}
          serviceName={service.name}
          staffName={staff.display_name}
          startsAtIso={startsAt.toISOString()}
          pricePence={effectivePricePence}
          depositPence={effectiveDepositPence}
          redemptionId={redemption?.id ?? null}
          useClientPackageId={consumedPack?.id ?? null}
          staffId={chosenStaffIdForAction}
          resourceId={resourceParam ?? null}
          wallet={wallet}
          cancellationPolicy={{
            enabled: cancellationPolicy.enabled,
            lines: policyLines,
          }}
          savedCard={savedCard}
        />
      </div>
    </div>
  );
}

function formatDateTimeForHeader(d: Date): string {
  const datePart = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
  const timePart = d
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London",
    })
    .replace(/\s+/g, "")
    .toLowerCase();
  return `${datePart} · ${timePart}`;
}
