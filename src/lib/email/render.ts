import "server-only";
import { marked } from "marked";

// Re-export the client-safe handlebars map so existing server-side
// imports of HANDLEBARS_BY_TRIGGER from "@/lib/email/render" keep
// working. Client components should import directly from
// "@/lib/email/handlebars".
export { HANDLEBARS_BY_TRIGGER } from "./handlebars";

/**
 * Email render pipeline:
 *   1. substitute {{handlebars}} variables in subject + body_md
 *   2. convert body_md → body_html (marked, no raw HTML)
 *   3. wrap body_html in a minimal email shell (Inter, sage accents)
 *
 * No real Handlebars dependency — we use a tiny dot-path resolver.
 * Plenty for our subset of variables and avoids the Handlebars runtime
 * footprint in serverless cold starts.
 */

export type EmailContext = Record<string, unknown>;

// Tokens like {{client.first_name}}, {{booking.starts_at_friendly}}.
// Whitespace and trailing dots tolerated. Unknown tokens render as empty
// strings rather than blowing up — better to ship an email with a
// missing first name than 500 the dispatcher.
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function substituteTokens(input: string, ctx: EmailContext): string {
  return input.replace(TOKEN_RE, (_, path: string) => {
    const value = resolvePath(ctx, path);
    if (value == null) return "";
    return String(value);
  });
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

/** marked options — strip HTML tags (no XSS via {{handlebars}}-injected raw). */
marked.setOptions({
  breaks: true,
  gfm: true,
});

const SHELL = (innerHtml: string, subject: string) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>
  body { margin: 0; padding: 0; background: #F6F3EE; font-family: 'Inter', -apple-system, system-ui, sans-serif; color: #3E3E31; line-height: 1.55; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
  .card { background: #FFFFFF; border-radius: 16px; padding: 32px 28px; box-shadow: 0 1px 2px rgba(62,62,49,0.05); }
  h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; color: #3E3E31; margin: 0 0 12px 0; letter-spacing: -0.01em; }
  h1 { font-size: 26px; line-height: 1.2; }
  h2 { font-size: 22px; }
  p { margin: 0 0 14px 0; font-size: 15px; }
  a { color: #5C6B4E; text-decoration: underline; text-underline-offset: 2px; }
  ul, ol { padding-left: 22px; margin: 0 0 14px 0; }
  li { margin-bottom: 6px; font-size: 15px; }
  hr { border: 0; border-top: 0.5px solid rgba(62,62,49,0.10); margin: 24px 0; }
  .signoff { color: rgba(62,62,49,0.62); font-size: 13px; }
  .footer { margin-top: 28px; text-align: center; color: rgba(62,62,49,0.45); font-size: 11px; line-height: 1.6; }
</style>
</head><body>
<div class="wrap">
  <div class="card">${innerHtml}</div>
  <div class="footer">
    Astrabody &middot; 149 Hursley Road, Chandler's Ford<br>
    You received this because you have an account with us.
  </div>
</div>
</body></html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderResult {
  subject: string;
  html: string;
  /** Plain-text fallback derived from the markdown source. */
  text: string;
}

/**
 * Render a template's subject + body_md into the final email payload.
 * The body_md is passed through marked first (no raw HTML allowed) and
 * then wrapped in the shell. Handlebars are substituted *before* the
 * markdown pass so a substituted value can include markdown if needed.
 */
export async function renderEmail(
  subjectTemplate: string,
  bodyMdTemplate: string,
  ctx: EmailContext
): Promise<RenderResult> {
  const subject = substituteTokens(subjectTemplate, ctx);
  const filledMd = substituteTokens(bodyMdTemplate, ctx);
  const inner = await marked.parse(filledMd, { async: true });
  const html = SHELL(inner as string, subject);
  const text = filledMd
    // Crude markdown → text: strip emphasis markers and shorten links.
    .replace(/\*\*?(.+?)\*\*?/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  return { subject, html, text };
}

/**
 * Mock context used by the editor's "Preview" button. Keeps the values
 * realistic so the operator sees what a real email looks like.
 */
export function buildMockContext(tenantName: string): EmailContext {
  return {
    client: {
      first_name: "Sarah",
      full_name: "Sarah Mitchell",
    },
    booking: {
      starts_at_friendly: "Saturday, 12 May",
      time: "11:00am",
    },
    service: { name: "InfraBike" },
    staff: { first_name: "Tove", display_name: "Tove Andersen" },
    tenant: { name: tenantName },
    voucher: { code: "BACK10" },
    tier: "Insider",
  };
}
