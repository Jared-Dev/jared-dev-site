import { Redis } from "@upstash/redis";

let cached: Redis | undefined;

export function redis(): Redis {
  if (cached) return cached;
  cached = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cached;
}
