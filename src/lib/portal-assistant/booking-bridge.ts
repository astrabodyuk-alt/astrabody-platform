"use server";

import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentClient } from "@/lib/portal/queries";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface AssistantSlot {
  datetime: string;
  staffId: string | null;
  staffName: string;
}

/**
 * Fetch available slots for a service + date through the same path
 * the regular booking flow uses. The assistant doesn't drive the
 * resource picker; it asks for "any" and lets the resolver pick.
 */
export async function assistantFetchSlots(args: {
  serviceId: string;
  date: string;
  preferredStaffId?: string | null;
}): Promise<Result<{ slots: AssistantSlot[]; serviceName: string }>> {
  let me;
  try {
    me = await getCurrentClient();
  } catch {
    return { ok: false, error: "Sign in first." };
  }

  const admin = createAdminSupabase();
  const { data: service } = await admin
    .from("services")
    .select("id, name, tenant_id, is_bookable")
    .eq("id", args.serviceId)
    .maybeSingle();
  if (!service || service.tenant_id !== me.tenant_id) {
    return { ok: false, error: "Service not found." };
  }
  if (service.is_bookable === false) {
    return { ok: false, error: "Service isn't bookable right now." };
  }

  // Reuse /api/availability via internal HTTP. The route reads the
  // session from cookies, so an internal fetch from a server action
  // would lose the session — easier to call the slot-compute helper
  // directly. For V1 we hit the public route through the dev server
  // origin which preserves cookies on same-origin requests.
  const params = new URLSearchParams({
    serviceId: args.serviceId,
    date: args.date,
  });
  if (args.preferredStaffId) params.set("staffId", args.preferredStaffId);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const fetchUrl = origin
    ? `${origin}/api/availability?${params.toString()}`
    : `/api/availability?${params.toString()}`;

  // Look up the staff for the slot — the public availability route
  // already returns staffId + staffName. We just shape it.
  let json: {
    slots: string[];
    staffId: string | null;
    staffName: string | null;
  };
  try {
    // Forward session cookies so the availability route can authenticate.
    // Server actions don't propagate cookies automatically on internal fetches.
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await fetch(fetchUrl, {
      cache: "no-store",
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    });
    if (!res.ok) {
      return { ok: false, error: `Couldn't load slots (${res.status}).` };
    }
    json = (await res.json()) as typeof json;
  } catch (err) {
    console.warn("[assistant] availability fetch failed", err);
    return { ok: false, error: "Couldn't reach availability." };
  }

  const slots: AssistantSlot[] = json.slots.map((iso) => ({
    datetime: iso,
    staffId: json.staffId,
    staffName: json.staffName ?? "the team",
  }));

  return { ok: true, slots, serviceName: (service.name as string) ?? "Service" };
}

/**
 * Hand-off URL — the assistant can't safely confirm a paid booking
 * in chat (Stripe Elements lives on the checkout page). Return a
 * pre-loaded checkout URL so the client lands on the same form they
 * normally would, with the slot already chosen.
 */
export async function assistantBookingHandoffUrl(args: {
  serviceId: string;
  slotDatetime: string;
  staffId: string | null;
}): Promise<{ url: string }> {
  const dt = new Date(args.slotDatetime);
  const ymd = dt.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const hhmm = dt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
  const params = new URLSearchParams({ date: ymd, time: hhmm });
  if (args.staffId) params.set("staff", args.staffId);
  return {
    url: `/portal/book/${args.serviceId}/checkout?${params.toString()}`,
  };
}
