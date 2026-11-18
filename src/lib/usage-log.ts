import { sql } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { guardDbAfter } from "@/lib/db/guard";

/**
 * Per-request Anthropic usage record. Written to Postgres (usage_log)
 * after the response on every Anthropic call (classifier + main eval),
 * fail-open. Capped at USAGE_LOG_LIMIT rows by the maintenance cron.
 * Used by the `pnpm run usage-stats` CLI to understand cache hit rate,
 * cost, and whether the current TTL choice is paying off.
 */

export const USAGE_LOG_LIMIT = 10_000;

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

export interface UsageInput {
  kind: "classifier" | "eval";
  model: AnthropicModel;
  ttl: CacheTtl;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
}

/** Pure: cost and cache status for one call. */
export function buildUsageRecord(input: UsageInput): UsageRecord {
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
  return { timestamp: Date.now(), ...input, costUsd, status };
}

function insertUsage(d: Db, record: UsageRecord) {
  return d.execute(sql`
    INSERT INTO usage_log (kind, model, ttl, cache_write_tokens, cache_read_tokens,
                           input_tokens, output_tokens, cost_usd, status)
    VALUES (${record.kind}, ${record.model}, ${record.ttl}, ${record.cacheWriteTokens},
            ${record.cacheReadTokens}, ${record.inputTokens}, ${record.outputTokens},
            ${record.costUsd}, ${record.status})
  `);
}

/**
 * Records a finished call. The insert runs after the response is sent
 * and is fail-open: logging must never slow or break a request. Call it
 * while the request is still being handled.
 */
export function logUsage(input: UsageInput): UsageRecord {
  const record = buildUsageRecord(input);
  guardDbAfter("logUsage", (d) => insertUsage(d, record));
  return record;
}

/**
 * For streams: register the write up front (inside the request scope)
 * and let it wait for the usage numbers. Skipped if `usage` rejects.
 */
export function logUsageAfter(usage: Promise<UsageInput>): Promise<void> {
  return guardDbAfter(
    "logUsage",
    async (d) => insertUsage(d, buildUsageRecord(await usage)),
    usage,
  );
}

/** Admin (usage-stats CLI): direct, throws on failure. Newest first. */
export async function recentUsage(limit = 1000): Promise<UsageRecord[]> {
  const d = await db();
  const { rows } = (await d.execute(sql`
    SELECT (extract(epoch FROM created_at) * 1000)::float8 AS ts, kind, model, ttl,
           cache_write_tokens, cache_read_tokens, input_tokens, output_tokens,
           cost_usd, status
    FROM usage_log ORDER BY id DESC LIMIT ${limit}
  `)) as unknown as { rows: Array<Record<string, unknown>> };
  return rows.map((r) => ({
    timestamp: Number(r.ts),
    kind: r.kind as UsageRecord["kind"],
    model: r.model as AnthropicModel,
    ttl: r.ttl as CacheTtl,
    cacheWriteTokens: Number(r.cache_write_tokens),
    cacheReadTokens: Number(r.cache_read_tokens),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    costUsd: Number(r.cost_usd),
    status: r.status as UsageRecord["status"],
  }));
}
