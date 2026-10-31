import { Redis } from "@upstash/redis";

export interface RedisConfig {
  url: string | undefined;
  token: string | undefined;
}

/**
 * Two naming schemes exist for the same Upstash credentials:
 *  - KV_REST_API_URL / KV_REST_API_TOKEN: injected automatically when the
 *    database is connected through the Vercel Marketplace integration.
 *  - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN: Upstash's own
 *    names, used when credentials are pasted in by hand.
 *
 * Marketplace names win so a connected store can't be shadowed by stale,
 * hand-entered credentials for a database that no longer exists. URL and
 * token are taken as a pair from the same scheme, never mixed.
 */
type RedisEnv = Pick<
  NodeJS.ProcessEnv,
  | "KV_REST_API_URL"
  | "KV_REST_API_TOKEN"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN"
>;

export function resolveRedisConfig(env: RedisEnv): RedisConfig {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  }
  return {
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  };
}

let cached: Redis | undefined;

export function redis(): Redis {
  if (cached) return cached;
  cached = new Redis(resolveRedisConfig(process.env));
  return cached;
}
