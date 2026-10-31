/**
 * Scheduled Redis keep-alive and health check (schedule in vercel.json).
 *
 * Upstash archives free-tier databases after a stretch with no requests.
 * A portfolio site's traffic is bursty enough to hit that window, which
 * silently breaks the Fit Tool and the pre-push brief sync. This route
 * guarantees regular traffic, and because it fails loudly (503 plus an
 * error log) a dead database shows up in Vercel's runtime errors within
 * hours instead of being discovered by accident.
 *
 * Idempotent by design: Vercel cron delivery can skip or duplicate a
 * run, and writing the same kind of timestamp twice is harmless.
 */

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_KEY = "health:redis-keepalive";
/** Expire well after the next run so the key never piles up. */
const KEEPALIVE_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function GET(req: Request) {
  if (
    !isAuthorizedCronRequest(
      req.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  const stamp = new Date(started).toISOString();
  try {
    // Write then read back: proves a full round trip, not just that the
    // client constructed. A missing or archived database throws here.
    await redis().set(KEEPALIVE_KEY, stamp, { ex: KEEPALIVE_TTL_SECONDS });
    const echoed = await redis().get<string>(KEEPALIVE_KEY);
    if (echoed !== stamp) {
      throw new Error("Keep-alive read-back did not match the write");
    }
    return Response.json({ ok: true, latencyMs: Date.now() - started });
  } catch (err) {
    console.error(
      `[cron/redis-keepalive] Redis unreachable: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return Response.json(
      { ok: false, error: "Redis unreachable" },
      { status: 503 },
    );
  }
}
