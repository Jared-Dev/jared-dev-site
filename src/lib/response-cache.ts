import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { guardDb, guardDbAfter } from "@/lib/db/guard";

/**
 * URL/content-keyed cache of bot responses.
 *
 * Keyed by (prompt_hash, content_hash) where:
 *  - promptHash captures the entire eval system prompt (which already
 *    includes the brief). Any edit to the brief OR the system prompt
 *    prose in fit-prompt.ts produces a new promptHash, so all prior
 *    cached responses are effectively orphaned.
 *  - contentHash captures the JD content the bot is being asked about.
 *    If a recruiter pastes the same JD again, we hit. If the JD page
 *    has been updated even slightly (one new bullet), the hash differs
 *    and we re-evaluate.
 *
 * TTL is a week. Long because freshness is enforced by the content hash,
 * not by the clock; the TTL (expires_at, swept by the maintenance cron)
 * just keeps dead entries from accumulating indefinitely.
 *
 * Stored in Postgres (response_cache) and fail-open: with the database
 * down, a lookup is a miss and a write is dropped.
 *
 * The cache only applies on the FIRST turn of a fresh session (no
 * conversation history). Follow-up questions go through the live model
 * since their answer depends on conversational context.
 */

const RESPONSE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

const promptHashes = new Map<string, string>();

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** Memoized: the prompt is ~20 KB and identical for an instance's life. */
export function promptHash(systemPrompt: string): string {
  let hash = promptHashes.get(systemPrompt);
  if (!hash) {
    hash = shortHash(systemPrompt);
    promptHashes.clear();
    promptHashes.set(systemPrompt, hash);
  }
  return hash;
}

export function contentHash(input: string): string {
  return shortHash(input);
}

export async function getCachedResponse(
  input: string,
  systemPrompt: string,
): Promise<{ response: string; contentHash: string; promptHash: string } | null> {
  const ph = promptHash(systemPrompt);
  const ch = contentHash(input);
  const response = await guardDb("getCachedResponse", null, async (d) => {
    const { rows } = (await d.execute(sql`
      SELECT response FROM response_cache
      WHERE prompt_hash = ${ph} AND content_hash = ${ch} AND expires_at > now()
    `)) as unknown as { rows: Array<{ response: string }> };
    return rows[0]?.response ?? null;
  });
  if (!response) return null;
  return { response, contentHash: ch, promptHash: ph };
}

/** Upserts after the response is sent. `response` may resolve later (a stream). */
export function setCachedResponseAfter(
  input: string,
  systemPrompt: string,
  response: Promise<string>,
): Promise<void> {
  const ph = promptHash(systemPrompt);
  const ch = contentHash(input);
  return guardDbAfter(
    "setCachedResponse",
    async (d) => {
      const text = await response;
      if (!text) return;
      await d.execute(sql`
        INSERT INTO response_cache (prompt_hash, content_hash, response, expires_at)
        VALUES (${ph}, ${ch}, ${text},
                now() + make_interval(secs => ${RESPONSE_CACHE_TTL_SECONDS}))
        ON CONFLICT (prompt_hash, content_hash) DO UPDATE
          SET response = excluded.response, expires_at = excluded.expires_at
      `);
    },
    response,
  );
}
