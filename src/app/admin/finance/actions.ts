"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin/auth";
import {
  getCachedCoachRecommendations,
  generateCoachRecommendations,
  type CachedRecommendations,
} from "@/lib/coach/generator";
import {
  insertNotification,
  getOwnerOrAdminUserIds,
} from "@/lib/notifications/insert";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Refresh the AI coach recommendations for the current month. Owner-
 * only. Throttled to one regeneration per 24h to keep API spend
 * predictable. The throttle is server-enforced regardless of whether
 * the UI hides the button.
 */
export async function refreshCoachRecommendations(
  options?: { force?: boolean }
): Promise<
  | { ok: true; data: CachedRecommendations }
  | { ok: false; error: string; retryAfterMs?: number }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };
  if (ctx.role !== "owner") return { ok: false, error: "owner only" };

  // Cheap throttle: read the cached row, refuse if generated_at < 24h.
  const cached = await getCachedCoachRecommendations(ctx.tenantId);
  if (cached && !options?.force) {
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < TWENTY_FOUR_HOURS_MS) {
      return {
        ok: false,
        error: "Already refreshed in the last 24 hours.",
        retryAfterMs: TWENTY_FOUR_HOURS_MS - age,
      };
    }
  }

  try {
    const data = await generateCoachRecommendations(ctx.tenantId, ctx.userId);
    // Notify admins that a fresh plan is ready.
    try {
      const adminIds = await getOwnerOrAdminUserIds(ctx.tenantId);
      const monthLabel = new Date().toLocaleDateString("en-GB", {
        month: "long",
        timeZone: "Europe/London",
      });
      for (const userId of adminIds) {
        await insertNotification({
          tenantId: ctx.tenantId,
          recipientUserId: userId,
          kind: "coach_refreshed",
          priority: "low",
          title: `${monthLabel} plan refreshed`,
          body: `${data.recommendations.length} new recommendations from your AI advisor.`,
          actionUrl: "/admin/finance",
          payload: { month: data.monthIso },
          dedupeKey: `coach:${data.monthIso}`,
        });
      }
    } catch (e) {
      console.warn("[refreshCoachRecommendations] notification failed:", e);
    }
    revalidatePath("/admin/finance");
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generation failed";
    return { ok: false, error: msg };
  }
}

/**
 * First-load helper: if no cache exists for this month, generate one
 * silently. Returns whatever's now cached (or freshly generated). Used
 * by the Suspense-resolved coach card so the page never blocks first
 * paint waiting for Anthropic.
 */
export async function ensureCoachRecommendations(): Promise<
  | { ok: true; data: CachedRecommendations }
  | { ok: false; error: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "no admin session" };

  const cached = await getCachedCoachRecommendations(ctx.tenantId);
  if (cached) return { ok: true, data: cached };

  // Only owners can spend Anthropic budget. If a non-owner hits this
  // first, return empty — they'll see the empty-state copy.
  if (ctx.role !== "owner") {
    return { ok: false, error: "no recommendations yet" };
  }

  try {
    const data = await generateCoachRecommendations(ctx.tenantId, ctx.userId);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generation failed";
    return { ok: false, error: msg };
  }
}
