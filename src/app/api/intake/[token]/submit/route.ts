import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isFieldEmpty } from "@/lib/forms/shared";
import type { IntakeField } from "@/lib/forms/shared";

const MAX_ANSWER_BYTES = 200 * 1024; // 200 KB — generous for base64 signatures.

/**
 * POST /api/intake/[token]/submit
 *
 * Public, no auth — the token IS the auth. Validates the token,
 * checks expiry, validates required fields, persists answers +
 * submitted_at via the admin client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 64) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const answers = (body as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json({ error: "answers required" }, { status: 400 });
  }

  // Bound the payload size — saves us from a 50MB signature blob.
  const json = JSON.stringify(answers);
  if (json.length > MAX_ANSWER_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("intake_responses")
    .select(
      "id, expires_at, submitted_at, intake_forms (fields)"
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  type Joined = {
    id: string;
    expires_at: string;
    submitted_at: string | null;
    intake_forms:
      | { fields: IntakeField[] }
      | { fields: IntakeField[] }[]
      | null;
  };
  const row = data as unknown as Joined;
  if (row.submitted_at) {
    return NextResponse.json(
      { error: "already submitted" },
      { status: 409 }
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const form = Array.isArray(row.intake_forms)
    ? row.intake_forms[0]
    : row.intake_forms;
  if (!form) {
    return NextResponse.json({ error: "form missing" }, { status: 500 });
  }

  // Validate required fields server-side too (defence in depth).
  const incoming = answers as Record<string, unknown>;
  for (const f of form.fields) {
    if (!f.required) continue;
    if (isFieldEmpty(incoming[f.id])) {
      return NextResponse.json(
        { error: `Missing required field: ${f.label}` },
        { status: 400 }
      );
    }
  }

  const { error } = await admin
    .from("intake_responses")
    .update({
      answers: incoming,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
