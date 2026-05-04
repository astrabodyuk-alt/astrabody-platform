import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getMonthlyRevenueSeries, getTenantVatSettings } from "@/lib/finance/queries";
import { buildCalendarContext } from "./uk-calendar";

export type CoachIcon =
  | "trending-up"
  | "gift"
  | "mail"
  | "calendar"
  | "zap";

const ICONS: ReadonlySet<CoachIcon> = new Set([
  "trending-up",
  "gift",
  "mail",
  "calendar",
  "zap",
]);

export interface CoachRecommendation {
  title: string;
  body: string;
  icon: CoachIcon;
  cta?: string;
  cta_href?: string;
}

export interface CachedRecommendations {
  recommendations: CoachRecommendation[];
  generatedAt: string;
  monthIso: string;
}

const SYSTEM_PROMPT = `You are a business coach for premium UK beauty/wellness studios.
Given the studio's context, write 3 to 5 concrete, time-bound marketing or operational actions for the current month.
Use UK English. Prefer specific numbers and dates over vague advice. Keep each item under 30 words.
Output strictly as a JSON array of objects {title, body, icon, cta?, cta_href?} where icon is one of: trending-up, gift, mail, calendar, zap.
Do not wrap in markdown fences. Do not add prose before or after the JSON.`;

const TZ = "Europe/London";

function currentMonthIso(): string {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return ymd.slice(0, 7);
}

/**
 * Read the cached recommendation for this tenant + the *current*
 * calendar month. Null when none is cached yet.
 */
export async function getCachedCoachRecommendations(
  tenantId: string
): Promise<CachedRecommendations | null> {
  const monthIso = currentMonthIso();
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenants_coach_recommendations")
    .select("recommendations, generated_at, month_iso")
    .eq("tenant_id", tenantId)
    .eq("month_iso", monthIso)
    .maybeSingle();
  if (!data) return null;
  const recs = sanitiseRecs(data.recommendations as unknown);
  if (!recs) return null;
  return {
    recommendations: recs,
    generatedAt: data.generated_at as string,
    monthIso: data.month_iso as string,
  };
}

/**
 * Generate fresh recommendations and upsert into the cache. Caller
 * controls the throttle (e.g. owner-only refresh button limited to
 * once per 24h).
 */
export async function generateCoachRecommendations(
  tenantId: string,
  generatedByUserId: string
): Promise<CachedRecommendations> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const context = await buildContext(tenantId);
  const monthIso = currentMonthIso();

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });

  // Pull the first text block. The SDK union includes thinking / tool
  // blocks; narrow on `type === "text"` and read `.text` from the
  // narrowed branch.
  const text = response.content
    .map((block) =>
      "type" in block && block.type === "text" && "text" in block
        ? (block as { text: string }).text
        : ""
    )
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error("model returned non-JSON output");
  }
  const recs = sanitiseRecs(parsed);
  if (!recs || recs.length === 0) {
    throw new Error("model returned no usable recommendations");
  }

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("tenants_coach_recommendations")
    .upsert(
      {
        tenant_id: tenantId,
        month_iso: monthIso,
        recommendations: recs,
        generated_at: new Date().toISOString(),
        generated_by: generatedByUserId,
      },
      { onConflict: "tenant_id,month_iso" }
    );
  if (error) {
    throw new Error(`upsert failed: ${error.message}`);
  }

  return {
    recommendations: recs,
    generatedAt: new Date().toISOString(),
    monthIso,
  };
}

/** Build the prompt context for Claude — pure data, no preamble. */
async function buildContext(tenantId: string): Promise<string> {
  const admin = createAdminSupabase();
  const vat = await getTenantVatSettings(tenantId);
  const [tenantRow, services, revenue] = await Promise.all([
    admin
      .from("tenants")
      .select("name, slug")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("services")
      .select("name, price_pence, duration_min")
      .eq("tenant_id", tenantId)
      .eq("is_bookable", true)
      .order("sort_order", { ascending: true })
      .limit(20),
    getMonthlyRevenueSeries(tenantId, vat),
  ]);

  const tenantName =
    (tenantRow.data?.name as string | undefined) ?? "the studio";

  const lines: string[] = [];
  lines.push(`Studio: ${tenantName}.`);
  lines.push(
    `VAT: ${vat.registered ? `registered at ${vat.ratePct}%` : "not registered"}.`
  );

  // Services + prices.
  if (services.data && services.data.length > 0) {
    lines.push("Services on the menu (price in £):");
    for (const s of services.data as Array<{
      name: string;
      price_pence: number;
      duration_min: number;
    }>) {
      lines.push(
        `  - ${s.name} — £${(s.price_pence / 100).toFixed(2)} (${s.duration_min} min)`
      );
    }
  }

  // Last 3 months of KPIs.
  const last3 = revenue.slice(-3);
  if (last3.length > 0) {
    lines.push("Last 3 months revenue (TTC):");
    for (const m of last3) {
      lines.push(
        `  - ${m.monthIso}: £${(m.ttcPence / 100).toFixed(0)} across ${m.count} sales.`
      );
    }
  }

  // Loyalty programme summary — fixed values from CLAUDE.md.
  lines.push(
    "Loyalty programme: 10 pts / £ on completed bookings; tiers Friend (0+), Insider (1500+), Inner Circle (10000+); 12-month rolling expiry."
  );

  // UK retail calendar context for current + next month.
  lines.push("");
  lines.push(buildCalendarContext(new Date()));

  return lines.join("\n");
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function sanitiseRecs(value: unknown): CoachRecommendation[] | null {
  if (!Array.isArray(value)) return null;
  const out: CoachRecommendation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const body = typeof r.body === "string" ? r.body.trim() : "";
    const iconRaw = typeof r.icon === "string" ? (r.icon as string) : "zap";
    const icon: CoachIcon = (ICONS.has(iconRaw as CoachIcon)
      ? iconRaw
      : "zap") as CoachIcon;
    if (!title || !body) continue;
    const rec: CoachRecommendation = { title, body, icon };
    if (typeof r.cta === "string" && r.cta.trim()) rec.cta = r.cta.trim();
    if (typeof r.cta_href === "string" && r.cta_href.trim())
      rec.cta_href = r.cta_href.trim();
    out.push(rec);
    if (out.length >= 5) break;
  }
  return out.length === 0 ? null : out;
}
