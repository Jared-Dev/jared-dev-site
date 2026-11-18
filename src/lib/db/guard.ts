/**
 * Fail-open wrapper for every runtime database call.
 *
 * The database holds only non-critical state (abuse control, chat
 * memory, logs, cache). A database failure must never fail a request,
 * so callers pass a fallback and get it back on any error, timeout, or
 * missing configuration.
 *
 * A small per-instance circuit breaker keeps an outage from adding
 * latency to every request: after a failure, calls skip the database
 * entirely for BREAKER_MS, then the next call probes it again.
 */

import { after } from "next/server";
import { db, type Db } from "@/lib/db";

const TIMEOUT_MS = 3_000;
const BREAKER_MS = 30_000;

let openUntil = 0;

/** Test hook: close the breaker between cases. */
export function resetDbBreaker(): void {
  openUntil = 0;
}

export async function guardDb<T>(
  label: string,
  fallback: T,
  fn: (d: Db) => Promise<T>,
): Promise<T> {
  if (Date.now() < openUntil) return fallback;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      );
    });
    return await Promise.race([db().then(fn), timeout]);
  } catch (err) {
    const wasClosed = Date.now() >= openUntil;
    openUntil = Date.now() + BREAKER_MS;
    // One log line per outage window, not one per call.
    if (wasClosed) {
      console.error(
        `[db] ${label} failed; skipping the database for ${BREAKER_MS / 1000}s: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run a write after the response is sent (Next's `after`), fail-open.
 * Must be called during the request. Outside a request scope (CLI
 * scripts, tests) `after` throws, and the write runs immediately.
 *
 * `ready` (e.g. "the stream finished") is awaited before the write and
 * outside the query timeout; if it rejects, the write is skipped. Never
 * rejects.
 */
export function guardDbAfter(
  label: string,
  fn: (d: Db) => Promise<unknown>,
  ready: Promise<unknown> = Promise.resolve(),
): Promise<void> {
  const run = async () => {
    try {
      await ready;
    } catch {
      return;
    }
    await guardDb(label, undefined, async (d) => void (await fn(d)));
  };
  try {
    after(run);
    return Promise.resolve();
  } catch {
    // No request scope: run now. The returned promise lets scripts and
    // tests wait for the write; request handlers never need to.
    return run();
  }
}
