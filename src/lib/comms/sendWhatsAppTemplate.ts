import "server-only";

/**
 * Stub for the WhatsApp Cloud API template-send fallback.
 *
 * Used when a staff message lands and the client has no active Web Push
 * subscription. Falls back to a WhatsApp template message via the
 * existing bot endpoint.
 *
 * V1: logs the intent so we can verify the call site fires correctly.
 * V2: replace with a fetch to the bot's /send-template endpoint, or
 *     call the Meta WhatsApp Cloud API directly from this process if
 *     the bot is being deprecated. See bot/.env.local for the relevant
 *     META_* credentials.
 */
export interface WhatsAppTemplateInput {
  toPhone: string;
  templateName: string;
  variables: Record<string, string>;
}

export async function sendWhatsAppTemplate(
  input: WhatsAppTemplateInput
): Promise<{ ok: boolean; reason?: string }> {
  console.info(
    "[comms/sendWhatsAppTemplate] would send template",
    input.templateName,
    "to",
    input.toPhone,
    "with vars",
    input.variables,
    "(stub — no API call made; wire via the bot in V2)"
  );
  return { ok: true, reason: "stub" };
}
