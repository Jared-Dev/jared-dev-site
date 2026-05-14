import { recentUsage, type UsageRecord } from "../src/lib/usage-log";

interface Bucket {
  count: number;
  hits: number;
  writes: number;
  costUsd: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
}

function emptyBucket(): Bucket {
  return {
    count: 0,
    hits: 0,
    writes: 0,
    costUsd: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function addToBucket(b: Bucket, r: UsageRecord): void {
  b.count++;
  if (r.status === "hit") b.hits++;
  if (r.status === "write") b.writes++;
  b.costUsd += r.costUsd;
  b.cacheWriteTokens += r.cacheWriteTokens;
  b.cacheReadTokens += r.cacheReadTokens;
  b.inputTokens += r.inputTokens;
  b.outputTokens += r.outputTokens;
}

function formatBucket(label: string, b: Bucket): string {
  if (b.count === 0) return `  ${label}: no data`;
  const hitRate = b.count > 0 ? (b.hits / b.count) * 100 : 0;
  const avgCost = b.costUsd / b.count;
  return [
    `  ${label}`,
    `    requests:        ${b.count}`,
    `    hits:            ${b.hits} (${hitRate.toFixed(1)}%)`,
    `    writes:          ${b.writes}`,
    `    total cost:      $${b.costUsd.toFixed(4)}`,
    `    avg cost / req:  $${avgCost.toFixed(6)}`,
    `    tokens (in/out): ${b.inputTokens.toLocaleString()} / ${b.outputTokens.toLocaleString()}`,
    `    cache r/w:       ${b.cacheReadTokens.toLocaleString()} / ${b.cacheWriteTokens.toLocaleString()}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const limit = Number(process.argv[2] ?? 1000);
  const records = await recentUsage(limit);
  if (records.length === 0) {
    console.log("No usage records logged yet. Run the Fit Tool a few times and rerun.");
    return;
  }

  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;

  const all = emptyBucket();
  const last24h = emptyBucket();
  const last7d = emptyBucket();
  const eval24h = emptyBucket();
  const class24h = emptyBucket();

  // Time-since-last-write per kind (helps judge TTL effectiveness).
  const writeTimestamps: Record<"classifier" | "eval", number[]> = {
    classifier: [],
    eval: [],
  };

  for (const r of records) {
    addToBucket(all, r);
    if (now - r.timestamp <= ms24h) {
      addToBucket(last24h, r);
      if (r.kind === "eval") addToBucket(eval24h, r);
      if (r.kind === "classifier") addToBucket(class24h, r);
    }
    if (now - r.timestamp <= ms7d) addToBucket(last7d, r);
    if (r.status === "write") writeTimestamps[r.kind].push(r.timestamp);
  }

  console.log(`Usage stats (last ${records.length} records, newest first)\n`);

  console.log("By window:");
  console.log(formatBucket("Last 24 hours", last24h));
  console.log("");
  console.log(formatBucket("Last 7 days", last7d));
  console.log("");
  console.log(formatBucket("All recorded", all));
  console.log("");

  console.log("By model (last 24h):");
  console.log(formatBucket("Eval (Sonnet 4.6)", eval24h));
  console.log("");
  console.log(formatBucket("Classifier (Haiku 4.5)", class24h));
  console.log("");

  console.log("Cache write spacing (helps judge TTL):");
  for (const kind of ["eval", "classifier"] as const) {
    const ts = writeTimestamps[kind].sort((a, b) => a - b);
    if (ts.length < 2) {
      console.log(`  ${kind}: fewer than 2 writes recorded, no gap stats yet`);
      continue;
    }
    const gaps: number[] = [];
    for (let i = 1; i < ts.length; i++) {
      gaps.push(ts[i]! - ts[i - 1]!);
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)]!;
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const minutes = (ms: number) => (ms / 60000).toFixed(1);
    console.log(
      `  ${kind}: ${gaps.length} write gap(s), median ${minutes(median)} min, avg ${minutes(avg)} min`,
    );
    if (median < 5 * 60 * 1000) {
      console.log(
        `    → writes < 5 min apart. 1h TTL is paying off significantly vs the 5m default.`,
      );
    } else if (median < 60 * 60 * 1000) {
      console.log(
        `    → writes 5-60 min apart. 1h TTL helping; 5m default would be paying ${(median / (5 * 60 * 1000)).toFixed(1)}x more writes.`,
      );
    } else {
      console.log(
        `    → writes > 60 min apart. Traffic is sparse enough that cache is rarely warm; TTL choice is moot for this workload.`,
      );
    }
  }
  console.log("");

  console.log("Tip: pass a limit, e.g. `npm run usage-stats -- 5000`, to pull more records.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
