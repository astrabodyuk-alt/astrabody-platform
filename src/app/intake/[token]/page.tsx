import { notFound } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { IntakeFormClient } from "./IntakeFormClient";

/**
 * /intake/[token] — public, no auth. The token is the only thing the
 * client carries; we resolve the form + booking + tenant from it.
 *
 * Renders three states:
 *   - Submitted already: thank-you with the studio address.
 *   - Expired: a friendly note pointing the client at the studio.
 *   - Pending: the form, plus a Submit button posting to
 *     /api/intake/[token]/submit.
 */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("intake_responses")
    .select(
      "id, tenant_id, answers, submitted_at, expires_at, " +
        "intake_forms (id, name, fields, is_active), " +
        "bookings:booking_id (starts_at, services (name)), " +
        "tenants:tenant_id (name, slug, subdomain, custom_domain, brand_logo_url, brand_primary_hex)"
    )
    .eq("token", token)
    .maybeSingle();

  if (!data) notFound();

  type Joined = {
    id: string;
    tenant_id: string;
    answers: Record<string, string>;
    submitted_at: string | null;
    expires_at: string;
    intake_forms:
      | {
          id: string;
          name: string;
          fields: import("@/lib/forms/shared").IntakeField[];
          is_active: boolean;
        }
      | {
          id: string;
          name: string;
          fields: import("@/lib/forms/shared").IntakeField[];
          is_active: boolean;
        }[]
      | null;
    bookings:
      | { starts_at: string; services: { name: string } | { name: string }[] | null }
      | { starts_at: string; services: { name: string } | { name: string }[] | null }[]
      | null;
    tenants:
      | {
          name: string | null;
          brand_logo_url: string | null;
          brand_primary_hex: string | null;
        }
      | {
          name: string | null;
          brand_logo_url: string | null;
          brand_primary_hex: string | null;
        }[]
      | null;
  };

  const row = data as unknown as Joined;
  const form = Array.isArray(row.intake_forms)
    ? row.intake_forms[0]
    : row.intake_forms;
  if (!form) notFound();

  const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
  const service = booking
    ? Array.isArray(booking.services)
      ? booking.services[0]
      : booking.services
    : null;
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;

  const tenantName = tenant?.name ?? "the studio";
  const logoUrl = tenant?.brand_logo_url ?? null;
  const dateLabel = booking?.starts_at
    ? format(new Date(booking.starts_at), "EEEE, d MMMM")
    : "your appointment";
  const expired = new Date(row.expires_at).getTime() < Date.now();

  return (
    <main className="min-h-screen bg-cream px-4 py-8 sm:py-16">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={tenantName}
              width={36}
              height={36}
              className="h-9 w-9 rounded-md object-contain"
            />
          ) : null}
          <span className="font-serif text-[20px] font-medium tracking-tight text-olive">
            {tenantName}
          </span>
        </header>

        {row.submitted_at ? (
          <SuccessState
            tenantName={tenantName}
            dateLabel={dateLabel}
            address={null}
          />
        ) : expired ? (
          <ExpiredState tenantName={tenantName} />
        ) : (
          <>
            <div>
              <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
                Before your {service?.name ?? "session"} on {dateLabel}
              </h1>
              <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
                Please take 2 minutes to complete this health form.
              </p>
            </div>

            <IntakeFormClient
              token={token}
              fields={form.fields}
              initialAnswers={row.answers ?? {}}
            />
          </>
        )}
      </div>
    </main>
  );
}

function SuccessState({
  tenantName,
  dateLabel,
  address,
}: {
  tenantName: string;
  dateLabel: string;
  address: string | null;
}) {
  return (
    <div className="rounded-2xl bg-sage/10 p-6">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Thank you 🌿
      </h2>
      <p className="mt-2 text-[14px] text-olive">
        We look forward to seeing you on {dateLabel}.
      </p>
      <p className="mt-4 text-[13px] tracking-snug text-olive-soft">
        See you at {tenantName}.
      </p>
      {address && (
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {address}
        </p>
      )}
    </div>
  );
}

function ExpiredState({ tenantName }: { tenantName: string }) {
  return (
    <div className="rounded-2xl bg-sand/40 p-6">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        This form has expired.
      </h2>
      <p className="mt-2 text-[14px] tracking-snug text-olive">
        Please ask {tenantName} to resend the link. A quick reply to your
        booking confirmation works fastest.
      </p>
    </div>
  );
}
