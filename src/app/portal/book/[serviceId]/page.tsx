import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getServiceDetail,
  getStaffForService,
  getPortalContext,
} from "@/lib/portal/booking-queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActivePacksForClient } from "@/lib/portal/packs";
import { getActiveResourcesForService } from "@/lib/portal/resources";
import { SlotPicker } from "./SlotPicker";
import { PractitionerPicker } from "./PractitionerPicker";
import { ResourcePicker } from "./ResourcePicker";

/**
 * Booking flow steps 2 + 3.
 *
 *   Step 2 of 4 — Practitioner picker (no `?staff=` in URL)
 *   Step 3 of 4 — Date and time picker (with `?staff=any` or `?staff=<id>`)
 *
 * The practitioner step is the new gate: clients pick "Any practitioner"
 * (default behaviour, falls back to staff.sort_order) or a specific
 * staff member. Selection persists into the SlotPicker via the URL.
 */
export default async function BookSlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{
    reward?: string;
    staff?: string;
    resource?: string;
    source?: string;
  }>;
}) {
  const { serviceId } = await params;
  const {
    reward,
    staff: staffParam,
    resource: resourceParam,
    source,
  } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = await getServiceDetail(serviceId);
  if (!service) notFound();

  // No staff chosen yet → show the practitioner picker.
  if (!staffParam) {
    const practitioners = await getStaffForService(serviceId);
    return (
      <div className="px-4 pt-4 pb-32">
        <header className="mb-4 px-2 py-3">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Step 2 of 4
          </p>
          <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
            Who would you like to see?
          </h1>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            All our practitioners are trained on this treatment.
          </p>
          {reward && (
            <p className="mt-2 text-[12px] tracking-snug text-sage">
              Booking with your loyalty reward — nothing to pay today ✨
            </p>
          )}
        </header>
        <PractitionerPicker
          serviceId={serviceId}
          staff={practitioners}
          rewardId={reward ?? null}
        />
      </div>
    );
  }

  // Resolve a friendly label for the chosen staff (or "any") to show
  // above the slot grid.
  let chosenLabel = "Any practitioner";
  let staffIdForApi: string | null = null;
  if (staffParam !== "any") {
    const practitioners = await getStaffForService(serviceId);
    const found = practitioners.find((p) => p.id === staffParam);
    if (found) {
      chosenLabel = found.displayName;
      staffIdForApi = found.id;
    } else {
      // Bad staff id — fall through to "any" semantics rather than 404.
      chosenLabel = "Any practitioner";
    }
  }

  // Resource step (step 2.5 of 4) — only when the service has 2+
  // active resources AND the URL doesn't yet carry a `resource`
  // selection. Single-resource services skip this step transparently
  // (the booking action auto-attaches that resource at insert time).
  // Zero-resource services keep the original behaviour (no resource).
  const resources = await getActiveResourcesForService(serviceId);
  const needsResourceStep = resources.length >= 2 && !resourceParam;
  if (needsResourceStep) {
    return (
      <div className="px-4 pt-4 pb-32">
        <header className="mb-4 px-2 py-3">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Step 3 of 5
          </p>
          <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
            Choose your equipment
          </h1>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            Each option is identical except where noted.
          </p>
        </header>
        <ResourcePicker
          serviceId={serviceId}
          resources={resources}
          staffParam={staffParam}
          rewardId={reward ?? null}
        />
      </div>
    );
  }

  // Validate any user-supplied resource id; fall back to "any" silently
  // when stale/foreign ids are passed.
  let chosenResourceLabel: string | null = null;
  let resourceIdForApi: string | "any" | null = null;
  if (resources.length === 0) {
    resourceIdForApi = null;
  } else if (resources.length === 1) {
    resourceIdForApi = resources[0].id;
    chosenResourceLabel = resources[0].name;
  } else if (resourceParam === "any") {
    resourceIdForApi = "any";
    chosenResourceLabel = "Any available";
  } else if (resourceParam) {
    const match = resources.find((r) => r.id === resourceParam);
    if (match) {
      resourceIdForApi = match.id;
      chosenResourceLabel = match.name;
    } else {
      resourceIdForApi = "any";
      chosenResourceLabel = "Any available";
    }
  }

  // Pack-aware: if the client has at least one active pack for THIS
  // service, surface it. FIFO consumption — pick the soonest-expiring.
  // The notice + toggle live inside SlotPicker so the toggle state can
  // drive the URL written by the Continue button. We deliberately don't
  // surface the pack option when the client is on a free-service reward
  // path (mutually exclusive with packs).
  let activePackForService: {
    id: string;
    name: string;
    sessionsRemaining: number;
    sessionsTotal: number;
  } | null = null;
  if (!reward) {
    const portalCtx = await getPortalContext().catch(() => null);
    if (portalCtx) {
      const allPacks = await getActivePacksForClient(portalCtx.clientId);
      const matching = allPacks.filter((p) => p.serviceId === serviceId);
      if (matching.length > 0) {
        const p = matching[0]; // already sorted by expires_at asc
        activePackForService = {
          id: p.id,
          name: p.name,
          sessionsRemaining: p.sessionsRemaining,
          sessionsTotal: p.sessionsTotal,
        };
      }
    }
  }

  const stepLabel = resources.length >= 2 ? "Step 4 of 5" : "Step 3 of 4";

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="mb-2 px-2 py-3">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          {stepLabel}
        </p>
        <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          {service.name}
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {service.duration_min} min · with {chosenLabel}
          {chosenResourceLabel ? ` · ${chosenResourceLabel}` : ""}
        </p>
        {reward && (
          <p className="mt-2 text-[12px] tracking-snug text-sage">
            Booking with your loyalty reward — nothing to pay today ✨
          </p>
        )}
        {source === "book_again" && staffIdForApi && (
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            Booking with {chosenLabel} again —{" "}
            <Link
              href={`/portal/book/${serviceId}`}
              className="text-sage-deep underline-offset-2 hover:underline"
            >
              tap to change
            </Link>
            .
          </p>
        )}
      </header>

      <SlotPicker
        serviceId={serviceId}
        serviceName={service.name}
        rewardId={reward ?? null}
        staffId={staffIdForApi}
        staffName={chosenLabel}
        resourceId={resourceIdForApi}
        activePack={activePackForService}
      />
    </div>
  );
}
