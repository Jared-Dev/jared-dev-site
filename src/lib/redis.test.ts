import { describe, expect, it } from "vitest";
import { resolveRedisConfig } from "./redis";

const KV = {
  KV_REST_API_URL: "https://new-store.upstash.io",
  KV_REST_API_TOKEN: "kv-token",
};
const UPSTASH = {
  UPSTASH_REDIS_REST_URL: "https://old-store.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token",
};

describe("resolveRedisConfig", () => {
  it("prefers the Vercel Marketplace names over stale manual ones", () => {
    expect(resolveRedisConfig({ ...KV, ...UPSTASH })).toEqual({
      url: KV.KV_REST_API_URL,
      token: KV.KV_REST_API_TOKEN,
    });
  });

  it("falls back to Upstash's own names", () => {
    expect(resolveRedisConfig({ ...UPSTASH })).toEqual({
      url: UPSTASH.UPSTASH_REDIS_REST_URL,
      token: UPSTASH.UPSTASH_REDIS_REST_TOKEN,
    });
  });

  it("never mixes a URL from one scheme with a token from the other", () => {
    expect(
      resolveRedisConfig({ KV_REST_API_URL: KV.KV_REST_API_URL, ...UPSTASH }),
    ).toEqual({
      url: UPSTASH.UPSTASH_REDIS_REST_URL,
      token: UPSTASH.UPSTASH_REDIS_REST_TOKEN,
    });
  });
});
