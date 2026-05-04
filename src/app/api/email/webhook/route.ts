import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/email/webhook — Resend delivery webhook.
 *
 * Resend signs webhooks via Svix: headers svix-id, svix-timestamp,
 * svix-signature. Signature format is `v1,base64(hmac_sha256(secret,
 * "<svix-id>.<svix-timestamp>.<raw-body>"))`. We verify with
 * crypto.timingSafeEqual to prevent timing attacks.
 *
 * Mapped events → email_sends.status:
 *   email.delivered → 'delivered'
 *   email.bounced   → 'bounced'
 *   email.complained → 'bounced'  (treated as a hard bounce for V1)
 *   email.delivery_delayed → no change
 *   email.opened / email.clicked → no change (not tracked in V1)
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("RESEND_WEBHOOK_SECRET not configured", {
      status: 500,
    });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("missing svix headers", { status: 400 });
  }

  const rawBody = await req.text();

  if (!verifySvixSignature(secret, svixId, svixTimestamp, rawBody, svixSignature)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const eventType = payload.type ?? "";
  const data = payload.data ?? {};
  const resendEmailId =
    typeof data.email_id === "string"
      ? (data.email_id as string)
      : typeof data.id === "string"
        ? (data.id as string)
        : null;

  if (!resendEmailId) {
    // Some events don't have an email id (e.g. test pings). Ack and move on.
    return NextResponse.json({ ok: true, ignored: true });
  }

  let nextStatus: "delivered" | "bounced" | null = null;
  let errorText: string | null = null;
  if (eventType === "email.delivered") {
    nextStatus = "delivered";
  } else if (eventType === "email.bounced") {
    nextStatus = "bounced";
    errorText =
      typeof data.bounce === "object" && data.bounce
        ? JSON.stringify(data.bounce).slice(0, 500)
        : "bounced";
  } else if (eventType === "email.complained") {
    nextStatus = "bounced";
    errorText = "spam complaint";
  }

  if (!nextStatus) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminSupabase();
  const update: Record<string, unknown> = { status: nextStatus };
  if (errorText) update.error = errorText;
  const { error } = await admin
    .from("email_sends")
    .update(update)
    .eq("resend_id", resendEmailId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Svix signature: header looks like "v1,Base64Signature v1,SecondBase64".
 * Multiple signatures may be sent (key rotation). We accept if ANY of
 * them matches the computed HMAC.
 */
function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
  signatureHeader: string
): boolean {
  // Svix secrets are typically `whsec_<base64>` — strip the prefix.
  const decoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(decoded, "base64");
  } catch {
    return false;
  }
  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", key)
    .update(signedPayload)
    .digest("base64");

  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    if (timingSafeEq(sig, expected)) return true;
  }
  return false;
}

function timingSafeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
