import { fromZonedTime } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { ReviewsList, type ReviewRow } from "./ReviewsList";

/**
 * /admin/reviews — owner / admin view of every review request, plus
 * three KPIs across the top:
 *   1. Average NPS this month + arrow vs last month
 *   2. Google reviews requested + confirmed posted + conversion %
 *   3. Average response time (request → first response)
 *
 * Filter chips on the list narrow by promoter / passive / detractor /
 * no-response-yet.
 */
export default async function AdminReviewsPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();

  const TZ = "Europe/London";
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [year, month] = ymd.split("-").map(Number);
  const thisMonthStart = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    TZ
  );
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = fromZonedTime(
    `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}-01T00:00:00`,
    TZ
  );

  const { data } = await supabase
    .from("review_requests")
    .select(
      "id, status, nps_score, nps_comment, trigger_reason, created_at, " +
        "responded_at, google_review_clicked, google_review_confirmed_at, " +
        "clients (id, full_name, email)"
    )
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    nps_score: number | null;
    nps_comment: string | null;
    trigger_reason: string | null;
    created_at: string;
    responded_at: string | null;
    google_review_clicked: boolean | null;
    google_review_confirmed_at: string | null;
    clients:
      | { id: string; full_name: string | null; email: string | null }
      | { id: string; full_name: string | null; email: string | null }[]
      | null;
  }>;

  const reviewRows: ReviewRow[] = rows.map((r) => {
    const cli = pickFirst<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>(r.clients);
    return {
      id: r.id,
      status: r.status,
      npsScore: r.nps_score,
      npsComment: r.nps_comment,
      triggerReason: r.trigger_reason,
      createdAt: r.created_at,
      respondedAt: r.responded_at,
      googleReviewClicked: !!r.google_review_clicked,
      googleReviewConfirmedAt: r.google_review_confirmed_at,
      clientId: cli?.id ?? null,
      clientName: cli?.full_name ?? cli?.email ?? "—",
    };
  });

  // KPI math.
  const thisMonth = reviewRows.filter(
    (r) =>
      r.respondedAt && new Date(r.respondedAt) >= thisMonthStart
  );
  const lastMonth_ = reviewRows.filter(
    (r) =>
      r.respondedAt &&
      new Date(r.respondedAt) >= lastMonthStart &&
      new Date(r.respondedAt) < thisMonthStart
  );
  const avg = (arr: ReviewRow[]): number | null => {
    const scored = arr.filter((r) => r.npsScore !== null);
    if (scored.length === 0) return null;
    return (
      scored.reduce((acc, r) => acc + (r.npsScore as number), 0) /
      scored.length
    );
  };
  const npsThis = avg(thisMonth);
  const npsLast = avg(lastMonth_);

  const googleRequested = reviewRows.filter(
    (r) => (r.npsScore ?? 0) >= 9
  ).length;
  const googleConfirmed = reviewRows.filter(
    (r) => r.googleReviewConfirmedAt
  ).length;
  const googleConversion =
    googleRequested > 0
      ? Math.round((googleConfirmed / googleRequested) * 100)
      : null;

  const responded = reviewRows.filter((r) => r.respondedAt);
  const avgResponseMs =
    responded.length > 0
      ? responded.reduce(
          (acc, r) =>
            acc +
            (new Date(r.respondedAt as string).getTime() -
              new Date(r.createdAt).getTime()),
          0
        ) / responded.length
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Reviews
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          NPS scores, internal feedback, and the Google-review funnel.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NpsKpiCard valueThis={npsThis} valueLast={npsLast} />
        <Card className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Google reviews
          </p>
          <p className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums text-olive">
            {googleConfirmed} <span className="text-[18px] text-olive-soft">/ {googleRequested}</span>
          </p>
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            {googleConversion === null
              ? "No promoters yet"
              : `${googleConversion}% conversion`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Avg response time
          </p>
          <p className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums text-olive">
            {avgResponseMs === null ? "—" : formatDuration(avgResponseMs)}
          </p>
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            {responded.length} response{responded.length === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      <ReviewsList rows={reviewRows} />
    </div>
  );
}

function NpsKpiCard({
  valueThis,
  valueLast,
}: {
  valueThis: number | null;
  valueLast: number | null;
}) {
  let arrow: "up" | "down" | "flat" = "flat";
  let delta: string;
  if (valueThis === null) {
    delta = "no responses yet";
  } else if (valueLast === null) {
    delta = "no baseline";
  } else {
    const diff = valueThis - valueLast;
    arrow = diff > 0.05 ? "up" : diff < -0.05 ? "down" : "flat";
    const abs = Math.abs(diff).toFixed(1);
    delta =
      diff === 0
        ? "flat vs last month"
        : `${diff > 0 ? "+" : "−"}${abs} vs last month`;
  }
  const arrowChar = arrow === "up" ? "↗" : arrow === "down" ? "↘" : "→";
  const fg = arrow === "up" ? "#5C6B4E" : arrow === "down" ? "#D45B5B" : "#3E3E31";
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        Average NPS this month
      </p>
      <p
        className="mt-2 font-serif text-[28px] font-medium leading-none tracking-tightest tabular-nums"
        style={{ color: fg }}
      >
        {arrowChar} {valueThis === null ? "—" : valueThis.toFixed(1)}
      </p>
      <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
        {delta}
      </p>
    </Card>
  );
}

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) {
    const mins = Math.round(ms / 60_000);
    return `${mins}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  return `${(hours / 24).toFixed(1)}d`;
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}
