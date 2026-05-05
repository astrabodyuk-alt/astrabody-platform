/**
 * Keepalive endpoint — hit by the Vercel cron every 5 minutes to prevent
 * serverless cold starts. Returns a lightweight 200 with no DB calls.
 */
export const runtime = "edge";

export function GET() {
  return new Response("ok", { status: 200 });
}
