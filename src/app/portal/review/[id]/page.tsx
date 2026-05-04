import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ReviewClient } from "./ReviewClient";

/**
 * /portal/review/[id] — three-step NPS + (conditional) Google flow.
 *
 * Step 1: NPS slider (always).
 * Step 2: Google review CTA (ONLY when nps_score >= 9, hard gated
 *         server-side; the client component cannot opt into this
 *         branch by itself).
 * Step 3: Internal-only feedback (when nps_score < 9).
 *
 * The server fetches the review row + tenant Google URL + voucher %
 * up front so the page never has to talk to the DB at render time.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/portal/login?next=/portal/review/${id}`);

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) redirect(`/portal/login?next=/portal/review/${id}`);
  const clientId = link.client_id as string;

  const { data: row } = await admin
    .from("review_requests")
    .select(
      "id, tenant_id, client_id, status, nps_score, nps_comment, " +
        "google_review_clicked, google_review_confirmed_at, " +
        "tenants:tenant_id (name, google_business_review_url, review_bonus_voucher_pct), " +
        "clients (full_name)"
    )
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!row) notFound();

  type Raw = {
    id: string;
    tenant_id: string;
    client_id: string;
    status: string;
    nps_score: number | null;
    nps_comment: string | null;
    google_review_clicked: boolean | null;
    google_review_confirmed_at: string | null;
    tenants:
      | {
          name: string | null;
          google_business_review_url: string | null;
          review_bonus_voucher_pct: number | null;
        }
      | {
          name: string | null;
          google_business_review_url: string | null;
          review_bonus_voucher_pct: number | null;
        }[]
      | null;
    clients:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
  };
  const review = row as unknown as Raw;
  const tenant = pickFirst<{
    name: string | null;
    google_business_review_url: string | null;
    review_bonus_voucher_pct: number | null;
  }>(review.tenants);
  const client = pickFirst<{ full_name: string | null }>(review.clients);

  return (
    <div className="px-4 pt-8 pb-16 sm:pt-12">
      <div className="mx-auto max-w-[480px]">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          {tenant?.name ?? "Astrabody"}
        </p>
        <ReviewClient
          reviewId={review.id}
          firstName={firstName(client?.full_name)}
          status={review.status}
          npsScore={review.nps_score}
          npsComment={review.nps_comment}
          googleClicked={!!review.google_review_clicked}
          googleConfirmedAt={review.google_review_confirmed_at}
          googleReviewUrl={tenant?.google_business_review_url ?? null}
          voucherPct={tenant?.review_bonus_voucher_pct ?? 15}
        />
      </div>
    </div>
  );
}

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] || "there";
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
