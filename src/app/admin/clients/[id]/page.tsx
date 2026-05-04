import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatGBP, formatPoints } from "@/lib/utils";
import { PackHistory } from "./PackHistory";
import { ClientReferralsPanel } from "./ClientReferralsPanel";
import {
  ClientIntakePanel,
  type ClientIntakeRow,
} from "./ClientIntakePanel";

/**
 * /admin/clients/[id] — per-client detail.
 *
 * Minimal V1: header (name, email, phone, tier + lifetime points),
 * "Active packs" section, "Pack history" section. The rest of the
 * client surface (timeline, bookings, notes) lives on later prompts.
 */
export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAdminContextOrRedirect();
  const { id } = await params;
  const supabase = await createServerSupabase();

  const [
    clientResult,
    packsResult,
    referralsAsReferrerResult,
    referralAsReferredResult,
    intakeResult,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, tenant_id, full_name, email, phone, source, bookings_count, " +
          "last_booking_at, total_spend_pence, created_at, referral_code, " +
          "loyalty_accounts (tier, lifetime_points, current_points)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("client_packages")
      .select(
        "id, sessions_total, sessions_remaining, status, expires_at, created_at, " +
          "service_packages:package_id (name), " +
          "package_purchases (id, sold_by:sold_by_staff_id (display_name), created_at)"
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("referrals")
      .select(
        "id, status, converted_at, rewarded_at, referrer_credit_pence, referred_client_id, referred:referred_client_id (full_name)"
      )
      .eq("referrer_client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("referrals")
      .select(
        "id, status, referrer_client_id, referrer:referrer_client_id (full_name)"
      )
      .eq("referred_client_id", id)
      .maybeSingle(),
    supabase
      .from("intake_responses")
      .select(
        "id, submitted_at, expires_at, answers, created_at, " +
          "intake_forms (name, fields), " +
          "bookings:booking_id (starts_at, services (name))"
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const client = clientResult.data as
    | {
        id: string;
        tenant_id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        source: string | null;
        bookings_count: number | null;
        last_booking_at: string | null;
        total_spend_pence: number | null;
        created_at: string;
        loyalty_accounts: unknown;
      }
    | null;

  if (!client || client.tenant_id !== ctx.tenantId) {
    notFound();
  }

  const acct = pickFirst<{
    tier: string;
    lifetime_points: number;
    current_points: number;
  }>(client.loyalty_accounts);

  const packs = (packsResult.data ?? []) as unknown as Array<{
    id: string;
    sessions_total: number;
    sessions_remaining: number;
    status: "active" | "expired" | "cancelled" | "consumed";
    expires_at: string;
    created_at: string;
    service_packages: { name: string } | { name: string }[] | null;
    package_purchases:
      | Array<{
          id: string;
          sold_by: { display_name: string } | { display_name: string }[] | null;
          created_at: string;
        }>
      | null;
  }>;

  const activePacks = packs.filter((p) => p.status === "active");
  const inactivePacks = packs.filter((p) => p.status !== "active");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            <Link href="/admin/clients" className="hover:underline">
              Clients
            </Link>
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
            {client.full_name ?? client.email ?? "Client"}
          </h1>
          <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
            {[client.email, client.phone].filter(Boolean).join(" · ") || "No contact details on file"}
          </p>
        </div>
        <Link href={`/admin/sales/new?clientId=${client.id}`}>
          <Button type="button" variant="primary" size="sm">
            Sell another pack
          </Button>
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Tier"
          value={tierLabel(acct?.tier ?? "friend")}
        />
        <KpiCard
          label="Lifetime points"
          value={formatPoints(acct?.lifetime_points ?? 0)}
        />
        <KpiCard
          label="Total spend"
          value={formatGBP(client.total_spend_pence ?? 0)}
        />
      </div>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Active packs
        </h2>
        {activePacks.length === 0 ? (
          <Card className="mt-4 p-5">
            <p className="text-[13px] tracking-snug text-olive-soft">
              No active packs. Sell one with the button above.
            </p>
          </Card>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {activePacks.map((p) => (
              <li key={p.id}>
                <ActivePackCard pack={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <PackHistory packs={inactivePacks} />

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Referrals
        </h2>
        <ClientReferralsPanel
          referralCode={(client as unknown as { referral_code: string | null }).referral_code ?? null}
          asReferrer={pickReferralRows(referralsAsReferrerResult.data)}
          asReferred={pickReferredFromMaybe(referralAsReferredResult.data)}
        />
      </section>

      <section>
        <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Forms
        </h2>
        <ClientIntakePanel rows={shapeIntakeRows(intakeResult.data)} />
      </section>
    </div>
  );
}

function pickReferralRows(
  raw: unknown
): Array<{
  id: string;
  status: "pending" | "converted" | "rewarded";
  converted_at: string | null;
  rewarded_at: string | null;
  referrer_credit_pence: number;
  referred_name: string | null;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as {
      id: string;
      status: "pending" | "converted" | "rewarded";
      converted_at: string | null;
      rewarded_at: string | null;
      referrer_credit_pence: number;
      referred:
        | { full_name: string | null }
        | { full_name: string | null }[]
        | null;
    };
    const ref = Array.isArray(row.referred) ? row.referred[0] : row.referred;
    return {
      id: row.id,
      status: row.status,
      converted_at: row.converted_at,
      rewarded_at: row.rewarded_at,
      referrer_credit_pence: row.referrer_credit_pence,
      referred_name: ref?.full_name ?? null,
    };
  });
}

function pickReferredFromMaybe(
  raw: unknown
): { id: string; status: string; referrer_name: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id: string;
    status: string;
    referrer:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
  };
  const ref = Array.isArray(row.referrer) ? row.referrer[0] : row.referrer;
  return {
    id: row.id,
    status: row.status,
    referrer_name: ref?.full_name ?? null,
  };
}

function ActivePackCard({
  pack,
}: {
  pack: {
    id: string;
    sessions_total: number;
    sessions_remaining: number;
    status: string;
    expires_at: string;
    service_packages: { name: string } | { name: string }[] | null;
    package_purchases:
      | Array<{
          id: string;
          sold_by: { display_name: string } | { display_name: string }[] | null;
          created_at: string;
        }>
      | null;
  };
}) {
  const pkg = pickFirst<{ name: string }>(pack.service_packages);
  const purchase = (pack.package_purchases ?? [])[0];
  const soldBy = pickFirst<{ display_name: string }>(purchase?.sold_by);
  const used = pack.sessions_total - pack.sessions_remaining;
  const pct = Math.max(
    0,
    Math.min(100, (pack.sessions_remaining / pack.sessions_total) * 100)
  );
  const expiresInDays = Math.max(
    0,
    Math.ceil((new Date(pack.expires_at).getTime() - Date.now()) / 86_400_000)
  );

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium tracking-snug text-olive">
          {pkg?.name ?? "Pack"}
        </p>
        <span className="text-[12px] tabular-nums tracking-snug text-olive">
          {pack.sessions_remaining} / {pack.sessions_total} sessions
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
        <div
          className="h-full rounded-full bg-sage transition-[width] duration-300 ease-ios"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 text-[12px] tracking-snug text-olive-soft">
        {used > 0 ? `${used} used · ` : ""}Expires in {expiresInDays} day{expiresInDays === 1 ? "" : "s"}
        {soldBy ? ` · Sold by ${soldBy.display_name}` : ""}
        {purchase ? ` on ${formatShortDate(purchase.created_at)}` : ""}
      </p>
    </Card>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </p>
      <p className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums text-olive">
        {value}
      </p>
    </Card>
  );
}

function tierLabel(tier: string): string {
  if (tier === "inner_circle") return "Inner Circle";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function shapeIntakeRows(raw: unknown): ClientIntakeRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const row = r as {
        id: string;
        submitted_at: string | null;
        expires_at: string;
        answers: Record<string, string>;
        created_at: string;
        intake_forms:
          | { name: string; fields: import("@/lib/forms/shared").IntakeField[] }
          | { name: string; fields: import("@/lib/forms/shared").IntakeField[] }[]
          | null;
        bookings:
          | { starts_at: string; services: { name: string } | { name: string }[] | null }
          | { starts_at: string; services: { name: string } | { name: string }[] | null }[]
          | null;
      };
      const form = Array.isArray(row.intake_forms)
        ? row.intake_forms[0]
        : row.intake_forms;
      if (!form) return null;
      const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
      const svc = booking
        ? Array.isArray(booking.services)
          ? booking.services[0]
          : booking.services
        : null;
      return {
        id: row.id,
        formName: form.name,
        fields: form.fields,
        answers: row.answers ?? {},
        submitted_at: row.submitted_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
        booking_starts_at: booking?.starts_at ?? null,
        service_name: svc?.name ?? null,
      } satisfies ClientIntakeRow;
    })
    .filter((r): r is ClientIntakeRow => !!r);
}
