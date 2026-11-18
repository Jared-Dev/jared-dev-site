import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * One Drizzle client per process, created lazily (same setup as
 * HiveConf). Two drivers behind one type:
 *   postgres://…  → node-postgres Pool. No named prepared statements are
 *                   used, so PgBouncer transaction pooling is safe.
 *   pglite://<dir> (or pglite://memory) → in-process Postgres (WASM) for
 *                   `pnpm dev` and unit tests: zero network, self-migrating.
 *
 * Runtime callers never use this directly; they go through guard.ts so a
 * database failure degrades instead of failing the request. Admin
 * scripts use it directly so they fail loudly.
 */
export type Db = NodePgDatabase<typeof schema>;

// Cached on globalThis, not a module-level `let`: in `next dev` the route
// handler graphs are separate module instances, and two PGlite instances
// over one directory would not share a live view.
const dbGlobal = globalThis as unknown as { __jaredDevDb?: Promise<Db> };

/**
 * Local dev runs on embedded PGlite regardless of .env.local's
 * DATABASE_URL, so `pnpm dev` can never write to a shared database.
 * An explicit pglite:// URL wins; DEV_REMOTE_DB=1 opts into the remote.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  const localDev =
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    process.env.DEV_REMOTE_DB !== "1";
  if (localDev && !url?.startsWith("pglite://")) {
    return "pglite://.tmp/pglite-dev";
  }
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

// PGlite is a single connection; serialize every operation on it so
// overlapping requests in `next dev` can't interleave statements.
function serializePglite<T extends object>(client: T): T {
  let tail: Promise<unknown> = Promise.resolve();
  const serial =
    (fn: (...a: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) => {
      const result = tail.then(() => fn(...args));
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    };
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const bound = (value as (...a: unknown[]) => unknown).bind(target);
      if (prop === "query" || prop === "exec" || prop === "transaction") {
        return serial(bound as (...a: unknown[]) => Promise<unknown>);
      }
      return bound;
    },
  }) as T;
}

async function create(): Promise<Db> {
  const url = resolveDatabaseUrl();

  if (url.startsWith("pglite://")) {
    const target = url.slice("pglite://".length);
    const onDisk = target !== "memory" && target !== "";
    if (onDisk) mkdirSync(dirname(target), { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = serializePglite(new PGlite(onDisk ? target : undefined));
    await migratePglite(client);
    return drizzle(client, { schema }) as unknown as Db;
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    // Low traffic, single-query requests: one socket covers nearly every
    // request. Idle sockets release fast so warm instances don't pin
    // PgBouncer slots.
    max: 2,
    idleTimeoutMillis: 10_000,
    // Short on purpose: every runtime query is optional (guard.ts), so a
    // slow database must give up quickly rather than hold the request.
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_500,
    allowExitOnIdle: true,
  });
  // An idle client erroring (server restart, network blip) must not
  // crash the process; the pool drops it and the next query reconnects.
  pool.on("error", (err) => {
    console.warn(`[db] idle client error: ${err.message}`);
  });
  return drizzle(pool, { schema });
}

export function db(): Promise<Db> {
  if (!dbGlobal.__jaredDevDb) {
    const pending = create();
    dbGlobal.__jaredDevDb = pending;
    // Don't cache a failed init forever; the next call retries.
    pending.catch(() => {
      if (dbGlobal.__jaredDevDb === pending) dbGlobal.__jaredDevDb = undefined;
    });
  }
  return dbGlobal.__jaredDevDb;
}

/**
 * PGlite has no runner wired to drizzle-kit's journal, so local mode
 * applies the generated SQL migrations directly, tracked in a tiny
 * table. Same SQL files as production: one source of schema truth.
 */
async function migratePglite(client: {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): Promise<void> {
  const { readdir, readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await client.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  for (const f of files) {
    const done = await client.query(
      `SELECT 1 FROM _migrations WHERE name = $1`,
      [f],
    );
    if (done.rows.length > 0) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
    await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [f]);
  }
}

export { schema };
