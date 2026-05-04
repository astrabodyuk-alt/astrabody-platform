"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getCurrentClient } from "@/lib/portal/queries";
import type {
  ChatMessage,
  PortalAssistantContext,
  AssistantReply,
  AssistantAction,
} from "./types";
import { getPortalAssistantContext as fetchContext } from "./queries";

type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// In-memory rate limit. Map<clientId, number[]> — timestamps of recent
// message starts. Resets on server restart, which is fine for V1.
const RATE_LIMIT_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
const recentByClient = new Map<string, number[]>();

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const arr = (recentByClient.get(clientId) ?? []).filter(
    (t) => now - t < HOUR_MS
  );
  if (arr.length >= RATE_LIMIT_PER_HOUR) {
    recentByClient.set(clientId, arr);
    return true;
  }
  arr.push(now);
  recentByClient.set(clientId, arr);
  return false;
}

const SYSTEM_PROMPT = `You are the Astrabody concierge assistant. Astrabody is a premium aesthetic clinic in Chandler's Ford, UK. You are warm, concise, and human — like a helpful friend who works at the studio.

Voice rules:
- UK English. Never use em-dashes. Use commas, full stops, parentheses.
- Contractions OK ("we're", "you've"). No filler openers ("Thank you for", "Absolutely").
- Keep replies under 80 words.
- Bullet points only when listing slots.

You can trigger one of these action types per reply:
- SHOW_SLOTS — when the client picks a service AND a date you can resolve.
- CONFIRM_BOOKING — only after the client has explicitly confirmed a specific slot.
- CLARIFY_DATE — booking intent is clear, the date is ambiguous.
- CLARIFY_SERVICE — booking intent is clear, the service is ambiguous.
- RECOMMEND — the client asked "what should I try next?" or similar; suggest from their recent_bookings.
- null — for read-only answers (pack balance, prices, hours).

Out-of-scope (cancellations, account changes, anything not in your tools): apologise briefly, point them at the studio phone if available. Action stays null.

Respond ONLY with valid JSON in this exact shape, no prose, no markdown fences:
{ "message": "...", "action": null | { ... } }

If "action" is SHOW_SLOTS the JSON is { "type": "SHOW_SLOTS", "serviceId": "...", "date": "YYYY-MM-DD", "timeWindow": "morning"|"afternoon"|"evening"|null }. Set timeWindow when the client mentions a time of day preference (morning = before 12:00, afternoon = 12:00-17:00, evening = 17:00+), otherwise null.
If CONFIRM_BOOKING: { "type": "CONFIRM_BOOKING", "serviceId": "...", "staffId": "..." | null, "slotDatetime": "<ISO>" }.
If CLARIFY_DATE: { "type": "CLARIFY_DATE" }.
If CLARIFY_SERVICE: { "type": "CLARIFY_SERVICE" }.
If RECOMMEND: { "type": "RECOMMEND" }.

Never emit a serviceId / staffId not present in the context. Resolve relative dates (today, tomorrow, next Tuesday) against {today} in {timezone}.`;

interface ChatInput {
  messages: ChatMessage[];
}

export async function portalAssistantChat(
  input: ChatInput
): Promise<Result<{ reply: AssistantReply; context: PortalAssistantContext }>> {
  let me;
  try {
    me = await getCurrentClient();
  } catch {
    return { ok: false, error: "Sign in to chat with the assistant." };
  }

  if (isRateLimited(me.id)) {
    return {
      ok: true,
      reply: {
        message:
          "You've sent a lot of messages — try again in a little while 🌿",
        action: null,
      },
      context: (await fetchContext()) as PortalAssistantContext,
    };
  }

  const context = await fetchContext();
  if (!context) {
    return { ok: false, error: "Couldn't load your account." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      reply: {
        message:
          "I'm not connected just now. The team can help by phone or in the chat tab.",
        action: null,
      },
      context,
    };
  }

  const messages = input.messages.slice(-12); // last 12 turns
  if (messages.length === 0) {
    return {
      ok: true,
      reply: {
        message: "How can I help today?",
        action: null,
      },
      context,
    };
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: context.tenantTimezone,
  });
  const promptHeader = SYSTEM_PROMPT.replace("{today}", today).replace(
    "{timezone}",
    context.tenantTimezone
  );
  const systemBlock = [
    promptHeader,
    "",
    "Account snapshot (truthy data only — never invent):",
    JSON.stringify(redactContext(context), null, 2),
  ].join("\n");

  const client = new Anthropic({ apiKey });

  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemBlock,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    raw = response.content
      .map((b) =>
        "type" in b && b.type === "text" && "text" in b
          ? (b as { text: string }).text
          : ""
      )
      .join("")
      .trim();
  } catch (err) {
    console.warn("[portal-assistant] anthropic error", err);
    return {
      ok: true,
      reply: {
        message:
          "I'm having trouble thinking right now — give it another go in a moment.",
        action: null,
      },
      context,
    };
  }

  const reply = parseReply(raw);
  return { ok: true, reply, context };
}

/**
 * Strip out anything the model doesn't need. The full ids stay for
 * SHOW_SLOTS / CONFIRM_BOOKING; everything else is human-readable.
 */
function redactContext(ctx: PortalAssistantContext): Record<string, unknown> {
  return {
    today_local: new Date().toLocaleDateString("en-CA", {
      timeZone: ctx.tenantTimezone,
    }),
    tenant_name: ctx.tenantName,
    timezone: ctx.tenantTimezone,
    studio_phone: ctx.studioPhone,
    client_name: ctx.clientName,
    loyalty_points: ctx.loyaltyPoints,
    loyalty_tier: ctx.loyaltyTierName,
    gift_card_balance_pence: ctx.giftCardBalance,
    active_packs: ctx.activePacks,
    upcoming_bookings: ctx.upcomingBookings,
    recent_bookings: ctx.recentBookings,
    services: ctx.services.map((s) => ({
      id: s.id,
      name: s.name,
      duration_min: s.durationMin,
      price_pence: s.pricePence,
    })),
    pack_catalogue: ctx.packCatalogue,
    active_promotions: ctx.activePromotions,
    working_hours: ctx.workingHours.map((w) => ({
      day_of_week: w.dayOfWeek,
      open: w.openTime,
      close: w.closeTime,
      closed: w.isClosed,
    })),
  };
}

function parseReply(raw: string): AssistantReply {
  let text = raw.trim();

  // 1. JSON inside a markdown fence anywhere in the response
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  } else if (text.startsWith("```")) {
    // fence at the very start (no trailing ```)
    text = text.replace(/^```(?:json)?/i, "").trim();
  } else {
    // 2. No fence — find the first { … } block (handles prose + bare JSON)
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) text = objMatch[0];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      message: raw.trim() || "I couldn't quite parse that — try rephrasing.",
      action: null,
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      message: "Sorry, that didn't come through cleanly.",
      action: null,
    };
  }
  const obj = parsed as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message : "";
  const action = parseAction(obj.action);
  return {
    message:
      message.trim() ||
      "All good — let me know if you'd like to book something.",
    action,
  };
}

function parseAction(value: unknown): AssistantAction {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  const type = a.type;
  if (type === "SHOW_SLOTS") {
    if (typeof a.serviceId === "string" && typeof a.date === "string") {
      const validWindows = ["morning", "afternoon", "evening"];
      const timeWindow =
        typeof a.timeWindow === "string" && validWindows.includes(a.timeWindow)
          ? (a.timeWindow as "morning" | "afternoon" | "evening")
          : null;
      return {
        type: "SHOW_SLOTS",
        serviceId: a.serviceId,
        date: a.date,
        timeWindow,
      };
    }
    return null;
  }
  if (type === "CONFIRM_BOOKING") {
    if (
      typeof a.serviceId === "string" &&
      typeof a.slotDatetime === "string"
    ) {
      return {
        type: "CONFIRM_BOOKING",
        serviceId: a.serviceId,
        staffId: typeof a.staffId === "string" ? a.staffId : null,
        slotDatetime: a.slotDatetime,
      };
    }
    return null;
  }
  if (
    type === "CLARIFY_DATE" ||
    type === "CLARIFY_SERVICE" ||
    type === "RECOMMEND"
  ) {
    return { type } as AssistantAction;
  }
  return null;
}
