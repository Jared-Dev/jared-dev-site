/**
 * Daily database maintenance and health check (schedule in vercel.json).
 *
 * One statement prunes everything that used to expire on its own in
 * Redis:
 *  - sessions idle past SESSION_IDLE_HOURS (their messages cascade),
 *  - expired response-cache entries,
 *  - event and usage logs beyond their row caps.
 *
 * It also doubles as the health check: a dead database returns 503 and
 * logs an error, so it shows up in Vercel's runtime errors within a day
 * even though every user-facing path fails open and keeps working.
 *
 * Idempotent: Vercel cron delivery can skip or duplicate a run, and
 * pruning twice is harmless.
 */

import { sql } from "drizzle-orm";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { EVENT_LOG_LIMIT, SESSION_IDLE_HOURS } from "@/lib/state";
import { USAGE_LOG_LIMIT } from "@/lib/usage-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    const d = await db();
    const result = (await d.execute(sql`
      WITH sessions AS (
        DELETE FROM fit_sessions
        WHERE updated_at < now() - make_interval(hours => ${SESSION_IDLE_HOURS})
        RETURNING 1
      ), cache AS (
        DELETE FROM response_cache WHERE expires_at < now() RETURNING 1
      ), events AS (
        DELETE FROM fit_events
        WHERE id <= (SELECT id FROM fit_events ORDER BY id DESC
                     OFFSET ${EVENT_LOG_LIMIT} LIMIT 1)
        RETURNING 1
      ), usage AS (
        DELETE FROM usage_log
        WHERE id <= (SELECT id FROM usage_log ORDER BY id DESC
                     OFFSET ${USAGE_LOG_LIMIT} LIMIT 1)
        RETURNING 1
      )
      SELECT
        (SELECT count(*) FROM sessions)::int AS sessions,
        (SELECT count(*) FROM cache)::int    AS cache,
        (SELECT count(*) FROM events)::int   AS events,
        (SELECT count(*) FROM usage)::int    AS usage
    `)) as unknown as { rows: Array<Record<string, number>> };
    return Response.json({
      ok: true,
      pruned: result.rows[0],
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    console.error(
      `[cron/db-maintenance] Database unreachable: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return Response.json(
      { ok: false, error: "Database unreachable" },
      { status: 503 },
    );
  }
}
