import { createHash } from "node:crypto";
import { BASE_SYSTEM_PROMPT } from "@/lib/eval";
import { redis } from "@/lib/redis";

/**
 * URL/content-keyed cache of bot responses.
 *
 * Cache key = `jd-response:{promptHash}:{contentHash}` where:
 *  - promptHash captures the entire eval system prompt (which already
 *    includes the brief content inlined at module load). Any edit to the
 *    brief OR the BASE_SYSTEM_PROMPT prose in eval.ts produces a new
 *    promptHash, so all prior cached responses are effectively orphaned.
 *  - contentHash captures the JD content the bot is being asked about.
 *    If a recruiter pastes the same JD again, we hit. If the JD page
 *    has been updated even slightly (one new bullet), the hash differs
 *    and we re-evaluate.
 *
 * TTL is a week. Long because freshness is enforced by the content hash,
 * not by the clock; the TTL is just a sweep to keep dead entries from
 * accumulating indefinitely.
 *
 * The cache only applies on the FIRST turn of a fresh session (no
 * conversation history). Follow-up questions go through the live model
 * since their answer depends on conversational context.
 */

const RESPONSE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESPONSE_CACHE_PREFIX = "jd-response";

let cachedPromptHash: string | null = null;

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function promptHash(): string {
  if (cachedPromptHash) return cachedPromptHash;
  cachedPromptHash = shortHash(BASE_SYSTEM_PROMPT);
  return cachedPromptHash;
}

export function contentHash(input: string): string {
  return shortHash(input);
}

function cacheKey(p: string, c: string): string {
  return `${RESPONSE_CACHE_PREFIX}:${p}:${c}`;
}

export async function getCachedResponse(
  input: string,
): Promise<{ response: string; contentHash: string; promptHash: string } | null> {
  const ph = promptHash();
  const ch = contentHash(input);
  const value = await redis().get<string>(cacheKey(ph, ch));
  if (!value) return null;
  return { response: value, contentHash: ch, promptHash: ph };
}

export async function setCachedResponse(
  input: string,
  response: string,
): Promise<void> {
  const ph = promptHash();
  const ch = contentHash(input);
  await redis().set(cacheKey(ph, ch), response, {
    ex: RESPONSE_CACHE_TTL_SECONDS,
  });
}
