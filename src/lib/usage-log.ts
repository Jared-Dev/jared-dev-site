import { redis } from "@/lib/redis";

/**
 * Per-request Anthropic usage record. Written to a capped Redis list on
 * every Anthropic call (classifier + main eval). Used by the
 * `npm run usage-stats` CLI to understand cache hit rate, cost,
 * and whether the current TTL choice is paying off.
 */

const USAGE_LOG_KEY = "usage:log";
const USAGE_LOG_LIMIT = 10_000;

export enum AnthropicModel {
  Sonnet46 = "sonnet-4-6",
  Haiku45 = "haiku-4-5",
}

export enum CacheTtl {
  FiveMin = "5m",
  OneHour = "1h",
}

/** USD per million tokens. Anthropic pricing as of 2026-05. */
const PRICING: Record<
  AnthropicModel,
  {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
  }
> = {
  [AnthropicModel.Sonnet46]: {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
  },
  [AnthropicModel.Haiku45]: {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite5m: 1,
    cacheWrite1h: 1.6,
  },
};

export interface UsageRecord {
  timestamp: number;
  /** "classifier" or "eval" */
  kind: "classifier" | "eval";
  model: AnthropicModel;
  ttl: CacheTtl;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost of this call. */
  costUsd: number;
  /** "hit" if cache_read>0 and cache_write==0, "write" if cache_write>0, else "no-cache". */
  status: "hit" | "write" | "no-cache";
}

function computeCost(
  model: AnthropicModel,
  ttl: CacheTtl,
  write: number,
  read: number,
  input: number,
  output: number,
): number {
  const p = PRICING[model];
  const writeRate = ttl === CacheTtl.OneHour ? p.cacheWrite1h : p.cacheWrite5m;
  return (
    (write * writeRate +
      read * p.cacheRead +
      input * p.input +
      output * p.output) /
    1_000_000
  );
}

export async function logUsage(input: {
  kind: "classifier" | "eval";
  model: AnthropicModel;
  ttl: CacheTtl;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
}): Promise<UsageRecord> {
  const costUsd = computeCost(
    input.model,
    input.ttl,
    input.cacheWriteTokens,
    input.cacheReadTokens,
    input.inputTokens,
    input.outputTokens,
  );
  const status: UsageRecord["status"] =
    input.cacheReadTokens > 0 && input.cacheWriteTokens === 0
      ? "hit"
      : input.cacheWriteTokens > 0
        ? "write"
        : "no-cache";
  const record: UsageRecord = {
    timestamp: Date.now(),
    kind: input.kind,
    model: input.model,
    ttl: input.ttl,
    cacheWriteTokens: input.cacheWriteTokens,
    cacheReadTokens: input.cacheReadTokens,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd,
    status,
  };
  // Fire-and-forget; do not block the request if Redis is slow.
  void (async () => {
    try {
      const r = redis();
      await r.lpush(USAGE_LOG_KEY, JSON.stringify(record));
      await r.ltrim(USAGE_LOG_KEY, 0, USAGE_LOG_LIMIT - 1);
    } catch {
      // Logging must never break the request path.
    }
  })();
  return record;
}

export async function recentUsage(limit = 1000): Promise<UsageRecord[]> {
  // Upstash auto-deserializes JSON-shaped strings on read, so entries may
  // come back as either pre-parsed objects or as raw strings depending on
  // how they were written. Normalize both.
  const raw = await redis().lrange<UsageRecord | string>(
    USAGE_LOG_KEY,
    0,
    limit - 1,
  );
  return raw.map((entry) =>
    typeof entry === "string" ? (JSON.parse(entry) as UsageRecord) : entry,
  );
}
