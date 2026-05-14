import { Redis } from "@upstash/redis";
import { serverEnv } from "@/lib/env";

let cached: Redis | undefined;

export function redis(): Redis {
  if (cached) return cached;
  const env = serverEnv();
  cached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cached;
}
