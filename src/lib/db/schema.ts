/**
 * Postgres schema (Drizzle). Migrations are generated from this file
 * with `pnpm db:generate` into ./drizzle and applied by
 * scripts/migrate-deploy.mjs on production builds; local dev and tests
 * self-migrate an embedded PGlite from the same SQL (see db/index.ts).
 *
 * Two kinds of data:
 *  - private_files: the Fit Bot brief and the resume. This repo is
 *    public, so they live here instead of in git, uploaded by
 *    `pnpm run private:upload` (also run by the pre-push hook).
 *  - Non-critical state: abuse control, conversation memory, logs, and a
 *    response cache. Every runtime read and write of these goes through
 *    db/guard.ts, so an outage degrades them instead of failing a request.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Gitignored content the site serves: "brief" and "resume". */
export const privateFiles = pgTable("private_files", {
  name: text("name").primaryKey(),
  data: bytea("data").notNull(),
  sha256: text("sha256").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** One Fit Tool conversation. Idle sessions expire after 24h (see state.ts). */
export const fitSessions = pgTable("fit_sessions", {
  id: text("id").primaryKey(),
  strikes: smallint("strikes").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  closedAt: ts("closed_at"),
});

/** Conversation memory fed back to the model on follow-up turns. */
export const fitMessages = pgTable(
  "fit_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: text("session_id")
      .notNull()
      .references(() => fitSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("fit_messages_session_idx").on(t.sessionId, t.id)],
);

/** Per-identity (hashed IP + UA) offense ladder. */
export const identities = pgTable(
  "identities",
  {
    hash: text("hash").primaryKey(),
    offenseCount: integer("offense_count").notNull().default(0),
    cooldownUntil: ts("cooldown_until"),
    permanentBlock: boolean("permanent_block").notNull().default(false),
  },
  (t) => [
    // list-blocks reads only the handful of blocked rows.
    index("identities_blocked_idx")
      .on(t.cooldownUntil)
      .where(sql`${t.permanentBlock} OR ${t.cooldownUntil} IS NOT NULL`),
  ],
);

/** Non-SAFE classifier verdicts. Capped by the maintenance cron. */
export const fitEvents = pgTable("fit_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: ts("created_at").notNull().defaultNow(),
  sessionId: text("session_id").notNull(),
  identityHash: text("identity_hash").notNull(),
  verdict: text("verdict").notNull(),
  type: text("type").notNull(),
  reason: text("reason").notNull(),
  input: text("input").notNull(),
  strikeCount: smallint("strike_count").notNull(),
  turn: integer("turn").notNull(),
});

/** One row per Anthropic call. Capped by the maintenance cron. */
export const usageLog = pgTable("usage_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: ts("created_at").notNull().defaultNow(),
  kind: text("kind").notNull(),
  model: text("model").notNull(),
  ttl: text("ttl").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: doublePrecision("cost_usd").notNull(),
  status: text("status").notNull(),
});

/** First-turn bot responses keyed by (system prompt, JD content). */
export const responseCache = pgTable(
  "response_cache",
  {
    promptHash: text("prompt_hash").notNull(),
    contentHash: text("content_hash").notNull(),
    response: text("response").notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.promptHash, t.contentHash] })],
);
