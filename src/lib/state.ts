import { redis } from "@/lib/redis";
import type {
  IdentityRecord,
  LogEntry,
  MessageRecord,
  SessionRecord,
} from "@/lib/types";

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const HISTORY_LIMIT = 50;
const LOG_LIMIT = 1000;
const MAX_INPUT_PERSIST_CHARS = 1000;

const SESSION_KEY = (sid: string) => `session:${sid}`;
const HISTORY_KEY = (sid: string) => `session:${sid}:history`;
const IDENTITY_KEY = (hash: string) => `identity:${hash}`;
const LOG_KEY = "events:log";
const ACTIVE_BLOCKS_KEY = "identity:active-blocks";

/**
 * iPhone-style progressive cooldown ladder, indexed by offense number (1-based).
 * Offense 1: no cooldown (just session reset).
 * Beyond the ladder: permanent (Jared-cleared only).
 */
const COOLDOWN_LADDER_SECONDS: readonly number[] = [
  0,
  30 * 60,
  90 * 60,
  12 * 3600,
  24 * 3600,
  30 * 24 * 3600,
];

export function cooldownForOffense(offenseCount: number): {
  cooldownSeconds: number;
  permanent: boolean;
} {
  if (offenseCount <= 0) return { cooldownSeconds: 0, permanent: false };
  if (offenseCount > COOLDOWN_LADDER_SECONDS.length) {
    return { cooldownSeconds: 0, permanent: true };
  }
  return { cooldownSeconds: COOLDOWN_LADDER_SECONDS[offenseCount - 1]!, permanent: false };
}

// ---------- Session ----------

export async function getSession(sid: string): Promise<SessionRecord | null> {
  const raw = await redis().hgetall(SESSION_KEY(sid));
  if (!raw || Object.keys(raw).length === 0) return null;
  const strikes = Number(raw.strikes ?? 0);
  const createdAt = Number(raw.createdAt ?? Date.now());
  const closedAt = raw.closedAt != null ? Number(raw.closedAt) : undefined;
  return { strikes, createdAt, ...(closedAt !== undefined && { closedAt }) };
}

export async function ensureSession(sid: string): Promise<SessionRecord> {
  const existing = await getSession(sid);
  if (existing) return existing;
  const fresh: SessionRecord = { strikes: 0, createdAt: Date.now() };
  await redis().hset(SESSION_KEY(sid), {
    strikes: fresh.strikes,
    createdAt: fresh.createdAt,
  });
  await redis().expire(SESSION_KEY(sid), SESSION_TTL_SECONDS);
  return fresh;
}

export async function appendMessage(sid: string, message: MessageRecord): Promise<void> {
  const r = redis();
  await r.rpush(HISTORY_KEY(sid), JSON.stringify(message));
  await r.ltrim(HISTORY_KEY(sid), -HISTORY_LIMIT, -1);
  await r.expire(HISTORY_KEY(sid), SESSION_TTL_SECONDS);
}

export async function getHistory(sid: string, limit = HISTORY_LIMIT): Promise<MessageRecord[]> {
  // Same Upstash auto-deserialization quirk: entries may come back as
  // pre-parsed objects or as JSON strings depending on the write path.
  const raw = await redis().lrange<MessageRecord | string>(
    HISTORY_KEY(sid),
    -limit,
    -1,
  );
  return raw.map((entry) =>
    typeof entry === "string" ? (JSON.parse(entry) as MessageRecord) : entry,
  );
}

export async function incrementStrikes(sid: string): Promise<number> {
  const newCount = await redis().hincrby(SESSION_KEY(sid), "strikes", 1);
  await redis().expire(SESSION_KEY(sid), SESSION_TTL_SECONDS);
  return newCount;
}

export async function markSessionClosed(sid: string): Promise<void> {
  await redis().hset(SESSION_KEY(sid), { closedAt: Date.now() });
}

// ---------- Identity / cooldown ----------

export async function getIdentity(hash: string): Promise<IdentityRecord> {
  const raw = await redis().hgetall(IDENTITY_KEY(hash));
  return {
    offenseCount: Number(raw?.offenseCount ?? 0),
    cooldownUntil: Number(raw?.cooldownUntil ?? 0),
    permanentBlock: (raw?.permanentBlock ?? 0) == 1 ? 1 : 0,
  };
}

export interface LockoutStatus {
  locked: boolean;
  permanent?: boolean;
  /** Unix ms when cooldown lifts. Absent if not locked or permanent. */
  until?: number;
}

export async function isLockedOut(hash: string): Promise<LockoutStatus> {
  const id = await getIdentity(hash);
  if (id.permanentBlock === 1) return { locked: true, permanent: true };
  if (id.cooldownUntil && id.cooldownUntil > Date.now()) {
    return { locked: true, until: id.cooldownUntil };
  }
  return { locked: false };
}

/**
 * Record a tier-3 session close for this identity. Advances the offense
 * counter and applies the next rung on the cooldown ladder. Returns the
 * new status so callers can communicate it to the user.
 */
export async function recordOffense(hash: string): Promise<{
  offenseCount: number;
  cooldownUntil: number | null;
  permanent: boolean;
}> {
  const r = redis();
  const offenseCount = await r.hincrby(IDENTITY_KEY(hash), "offenseCount", 1);
  const { cooldownSeconds, permanent } = cooldownForOffense(offenseCount);
  const updates: Record<string, number> = {};
  let cooldownUntil: number | null = null;
  if (permanent) {
    updates.permanentBlock = 1;
    await r.sadd(ACTIVE_BLOCKS_KEY, hash);
  } else if (cooldownSeconds > 0) {
    cooldownUntil = Date.now() + cooldownSeconds * 1000;
    updates.cooldownUntil = cooldownUntil;
    await r.sadd(ACTIVE_BLOCKS_KEY, hash);
  }
  if (Object.keys(updates).length > 0) {
    await r.hset(IDENTITY_KEY(hash), updates);
  }
  return { offenseCount, cooldownUntil, permanent };
}

export async function clearIdentity(hash: string): Promise<void> {
  await redis().del(IDENTITY_KEY(hash));
  await redis().srem(ACTIVE_BLOCKS_KEY, hash);
}

export async function listActiveBlocks(): Promise<
  Array<{ hash: string; identity: IdentityRecord }>
> {
  const hashes = await redis().smembers(ACTIVE_BLOCKS_KEY);
  const out: Array<{ hash: string; identity: IdentityRecord }> = [];
  for (const hash of hashes) {
    const identity = await getIdentity(hash);
    if (identity.permanentBlock === 1 || identity.cooldownUntil > Date.now()) {
      out.push({ hash, identity });
    } else {
      // Stale; sweep it.
      await redis().srem(ACTIVE_BLOCKS_KEY, hash);
    }
  }
  return out;
}

// ---------- Logging ----------

export async function logEvent(entry: LogEntry): Promise<void> {
  const compact: LogEntry = {
    ...entry,
    input: entry.input.slice(0, MAX_INPUT_PERSIST_CHARS),
  };
  const r = redis();
  await r.lpush(LOG_KEY, JSON.stringify(compact));
  await r.ltrim(LOG_KEY, 0, LOG_LIMIT - 1);
}

export async function recentEvents(limit = 100): Promise<LogEntry[]> {
  // Upstash auto-deserializes JSON-shaped strings on read. Handle both
  // pre-parsed objects and raw strings.
  const raw = await redis().lrange<LogEntry | string>(LOG_KEY, 0, limit - 1);
  return raw.map((entry) =>
    typeof entry === "string" ? (JSON.parse(entry) as LogEntry) : entry,
  );
}
