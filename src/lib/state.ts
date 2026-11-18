/**
 * Fit Tool state in Postgres: sessions, conversation memory, the
 * per-identity offense ladder, and the classifier event log.
 *
 * Runtime functions are fail-open (db/guard.ts): with the database down,
 * a turn runs as a fresh session with no history and no lockout, and
 * writes are dropped. Each is a single SQL statement so a turn costs one
 * round trip before the model call (two on a flagged message), with all
 * other writes deferred until after the response.
 *
 * Admin functions (recentEvents, getIdentity, clearIdentity,
 * listActiveBlocks) talk to the database directly and throw on failure,
 * because the CLI scripts that use them should fail loudly.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { guardDb, guardDbAfter } from "@/lib/db/guard";
import {
  type ClassifierType,
  type IdentityRecord,
  type LogEntry,
  type MessageRecord,
  type SessionRecord,
  type Verdict,
} from "@/lib/types";

/** Idle sessions (and their history) expire after this long. */
export const SESSION_IDLE_HOURS = 24;
export const HISTORY_LIMIT = 50;
export const EVENT_LOG_LIMIT = 1000;
const MAX_INPUT_PERSIST_CHARS = 1000;

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

// Trusted constants inlined as a SQL array literal (1-based in Postgres).
const LADDER_SQL = sql.raw(`ARRAY[${COOLDOWN_LADDER_SECONDS.join(",")}]::int[]`);
const LADDER_LEN = COOLDOWN_LADDER_SECONDS.length;
const IDLE = sql.raw(`interval '${SESSION_IDLE_HOURS} hours'`);

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  return (result as { rows: Row[] }).rows;
}

function msOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

// ---------- Turn context (one statement) ----------

export interface LockoutStatus {
  locked: boolean;
  permanent?: boolean;
  /** Unix ms when cooldown lifts. Absent if not locked or permanent. */
  until?: number;
}

export interface TurnContext {
  lockout: LockoutStatus;
  session: SessionRecord;
  history: MessageRecord[];
}

function lockoutFrom(permanent: boolean, cooldownUntilMs: number | null): LockoutStatus {
  if (permanent) return { locked: true, permanent: true };
  if (cooldownUntilMs && cooldownUntilMs > Date.now()) {
    return { locked: true, until: cooldownUntilMs };
  }
  return { locked: false };
}

/**
 * Upserts the session (resetting it if idle past SESSION_IDLE_HOURS),
 * and in the same round trip reads the identity's lockout state and the
 * session's recent history.
 */
export function loadTurnContext(
  sessionId: string,
  identityHash: string,
): Promise<TurnContext> {
  const fallback: TurnContext = {
    lockout: { locked: false },
    session: { strikes: 0, createdAt: Date.now() },
    history: [],
  };
  return guardDb("loadTurnContext", fallback, async (d) => {
    const [row] = rowsOf(
      await d.execute(sql`
        WITH s AS (
          INSERT INTO fit_sessions AS fs (id) VALUES (${sessionId})
          ON CONFLICT (id) DO UPDATE SET
            strikes    = CASE WHEN fs.updated_at < now() - ${IDLE} THEN 0     ELSE fs.strikes    END,
            closed_at  = CASE WHEN fs.updated_at < now() - ${IDLE} THEN NULL  ELSE fs.closed_at  END,
            created_at = CASE WHEN fs.updated_at < now() - ${IDLE} THEN now() ELSE fs.created_at END,
            updated_at = now()
          RETURNING strikes, created_at, closed_at
        )
        SELECT
          s.strikes::int AS strikes,
          (extract(epoch FROM s.created_at) * 1000)::float8 AS created_at_ms,
          (extract(epoch FROM s.closed_at) * 1000)::float8 AS closed_at_ms,
          coalesce(i.permanent_block, false) AS permanent_block,
          (extract(epoch FROM i.cooldown_until) * 1000)::float8 AS cooldown_until_ms,
          (
            SELECT coalesce(json_agg(json_build_object(
                     'role', m.role,
                     'content', m.content,
                     'timestamp', (extract(epoch FROM m.created_at) * 1000)::float8
                   ) ORDER BY m.id), '[]'::json)
            FROM (
              SELECT id, role, content, created_at FROM fit_messages
              WHERE session_id = ${sessionId} AND created_at >= s.created_at
              ORDER BY id DESC
              LIMIT ${HISTORY_LIMIT}
            ) m
          ) AS history
        FROM s
        LEFT JOIN identities i ON i.hash = ${identityHash}
      `),
    );
    if (!row) return fallback;
    const closedAt = msOrNull(row.closed_at_ms);
    const history =
      typeof row.history === "string"
        ? (JSON.parse(row.history) as MessageRecord[])
        : ((row.history ?? []) as MessageRecord[]);
    return {
      lockout: lockoutFrom(
        Boolean(row.permanent_block),
        msOrNull(row.cooldown_until_ms),
      ),
      session: {
        strikes: Number(row.strikes),
        createdAt: Number(row.created_at_ms),
        ...(closedAt !== null && { closedAt }),
      },
      history,
    };
  });
}

// ---------- Flags and offenses ----------

export interface FlagEvent {
  sessionId: string;
  identityHash: string;
  verdict: Verdict;
  type: ClassifierType;
  reason: string;
  input: string;
  turn: number;
}

/**
 * Adds a strike to the session and logs the flag event in one
 * statement. Returns the new strike count. Fail-open: with the database
 * down it returns currentStrikes + 1 (strikes can't accumulate).
 */
export function recordFlag(
  event: FlagEvent,
  currentStrikes: number,
): Promise<number> {
  const fallback = currentStrikes + 1;
  return guardDb("recordFlag", fallback, async (d) => {
    const [row] = rowsOf(
      await d.execute(sql`
        WITH s AS (
          UPDATE fit_sessions
          SET strikes = strikes + 1, updated_at = now()
          WHERE id = ${event.sessionId}
          RETURNING strikes
        ), e AS (
          INSERT INTO fit_events
            (session_id, identity_hash, verdict, type, reason, input, strike_count, turn)
          SELECT ${event.sessionId}, ${event.identityHash}, ${event.verdict}, ${event.type},
                 ${event.reason}, ${event.input.slice(0, MAX_INPUT_PERSIST_CHARS)},
                 coalesce((SELECT strikes FROM s), ${fallback}), ${event.turn}
        )
        SELECT strikes::int AS strikes FROM s
      `),
    );
    return row ? Number(row.strikes) : fallback;
  });
}

export interface OffenseResult {
  offenseCount: number;
  cooldownUntil: number | null;
  permanent: boolean;
}

/**
 * Tier-3 close: marks the session closed and advances the identity's
 * offense ladder in one statement. Returns the new status so callers
 * can communicate it to the user.
 */
export function closeSessionWithOffense(
  sessionId: string,
  identityHash: string,
): Promise<OffenseResult> {
  const fallback: OffenseResult = {
    offenseCount: 0,
    cooldownUntil: null,
    permanent: false,
  };
  const first = cooldownForOffense(1);
  return guardDb("closeSessionWithOffense", fallback, async (d) => {
    const [row] = rowsOf(
      await d.execute(sql`
        WITH c AS (
          UPDATE fit_sessions SET closed_at = now(), updated_at = now()
          WHERE id = ${sessionId}
        )
        INSERT INTO identities AS i (hash, offense_count, cooldown_until, permanent_block)
        VALUES (
          ${identityHash},
          1,
          ${first.cooldownSeconds > 0 ? sql`now() + make_interval(secs => ${first.cooldownSeconds})` : sql`NULL`},
          ${first.permanent}
        )
        ON CONFLICT (hash) DO UPDATE SET
          offense_count   = i.offense_count + 1,
          permanent_block = i.permanent_block OR i.offense_count + 1 > ${LADDER_LEN},
          cooldown_until  = CASE
            WHEN i.offense_count + 1 <= ${LADDER_LEN}
             AND (${LADDER_SQL})[i.offense_count + 1] > 0
            THEN now() + make_interval(secs => (${LADDER_SQL})[i.offense_count + 1])
            ELSE i.cooldown_until
          END
        RETURNING
          offense_count::int AS offense_count,
          permanent_block,
          (extract(epoch FROM cooldown_until) * 1000)::float8 AS cooldown_until_ms
      `),
    );
    if (!row) return fallback;
    const offenseCount = Number(row.offense_count);
    const { cooldownSeconds } = cooldownForOffense(offenseCount);
    return {
      offenseCount,
      cooldownUntil: cooldownSeconds > 0 ? msOrNull(row.cooldown_until_ms) : null,
      permanent: Boolean(row.permanent_block),
    };
  });
}

// ---------- Deferred writes ----------

/** Logs a non-SAFE, non-FLAG verdict after the response is sent. */
export function logEventAfter(
  event: FlagEvent,
  strikeCount: number,
): Promise<void> {
  return guardDbAfter("logEvent", (d) =>
    d.execute(sql`
      INSERT INTO fit_events
        (session_id, identity_hash, verdict, type, reason, input, strike_count, turn)
      VALUES (${event.sessionId}, ${event.identityHash}, ${event.verdict}, ${event.type},
              ${event.reason}, ${event.input.slice(0, MAX_INPUT_PERSIST_CHARS)},
              ${strikeCount}, ${event.turn})
    `),
  );
}

/**
 * Saves a completed turn (user message + assistant reply) after the
 * response is sent. `turn` may be a promise that resolves when a stream
 * finishes; if it rejects (stream error), nothing is saved.
 */
export function saveTurnAfter(
  sessionId: string,
  turn: Promise<MessageRecord[]> | MessageRecord[],
): Promise<void> {
  const ready = Promise.resolve(turn);
  return guardDbAfter(
    "saveTurn",
    async (d) => {
      const messages = (await ready).filter((m) => m.content.length > 0);
      if (messages.length === 0) return;
      const values = sql.join(
        messages.map(
          (m) => sql`(${sessionId}, ${m.role}, ${m.content})`,
        ),
        sql`, `,
      );
      await d.execute(sql`
        INSERT INTO fit_messages (session_id, role, content)
        SELECT v.session_id, v.role, v.content
        FROM (VALUES ${values}) AS v(session_id, role, content)
        WHERE EXISTS (SELECT 1 FROM fit_sessions WHERE id = ${sessionId})
      `);
    },
    ready,
  );
}

// ---------- Admin (direct; throws on failure) ----------

export async function recentEvents(limit = 100): Promise<LogEntry[]> {
  const d = await db();
  return rowsOf(
    await d.execute(sql`
      SELECT (extract(epoch FROM created_at) * 1000)::float8 AS ts, session_id,
             identity_hash, verdict, type, reason, input, strike_count, turn
      FROM fit_events ORDER BY id DESC LIMIT ${limit}
    `),
  ).map((r) => ({
    timestamp: Number(r.ts),
    sessionId: String(r.session_id),
    identityHash: String(r.identity_hash),
    verdict: r.verdict as Verdict,
    type: r.type as ClassifierType,
    reason: String(r.reason),
    input: String(r.input),
    strikeCount: Number(r.strike_count),
    turn: Number(r.turn),
  }));
}

function identityFrom(r: Row | undefined): IdentityRecord {
  return {
    offenseCount: Number(r?.offense_count ?? 0),
    cooldownUntil: Number(r?.cooldown_until_ms ?? 0),
    permanentBlock: r?.permanent_block ? 1 : 0,
  };
}

const IDENTITY_COLUMNS = sql`hash, offense_count, permanent_block,
  (extract(epoch FROM cooldown_until) * 1000)::float8 AS cooldown_until_ms`;

export async function getIdentity(hash: string): Promise<IdentityRecord> {
  const d = await db();
  const [row] = rowsOf(
    await d.execute(
      sql`SELECT ${IDENTITY_COLUMNS} FROM identities WHERE hash = ${hash}`,
    ),
  );
  return identityFrom(row);
}

export async function clearIdentity(hash: string): Promise<void> {
  const d = await db();
  await d.execute(sql`DELETE FROM identities WHERE hash = ${hash}`);
}

export async function listActiveBlocks(): Promise<
  Array<{ hash: string; identity: IdentityRecord }>
> {
  const d = await db();
  return rowsOf(
    await d.execute(sql`
      SELECT ${IDENTITY_COLUMNS} FROM identities
      WHERE permanent_block OR cooldown_until > now()
      ORDER BY cooldown_until DESC NULLS FIRST
    `),
  ).map((r) => ({ hash: String(r.hash), identity: identityFrom(r) }));
}
