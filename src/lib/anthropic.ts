import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

export const MODELS = {
  classifier: "claude-haiku-4-5-20251001",
  mainEval: "claude-sonnet-4-6",
} as const;

/**
 * Cache TTL for prompt caching. In production we use the 1-hour cache so
 * real recruiter traffic stays warm across visits. In dev we use the
 * 5-minute cache because we're constantly editing prompts and the brief,
 * which invalidates the cache anyway; paying the higher 1h write rate
 * for a cache that lives 30 seconds before the next edit is wasteful.
 */
export const CACHE_TTL: "5m" | "1h" =
  process.env.NODE_ENV === "production" ? "1h" : "5m";

let cached: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (cached) return cached;
  const env = serverEnv();
  cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cached;
}
