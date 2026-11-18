import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the real SQL against an in-memory PGlite (same migrations
 * as production), so the hand-written statements in state.ts,
 * response-cache.ts, usage-log.ts, private-files.ts, and the maintenance
 * cron are checked against an actual Postgres.
 */

vi.stubEnv("DATABASE_URL", "pglite://memory");
vi.stubEnv("CRON_SECRET", "c".repeat(32));
vi.stubEnv("PRIVATE_UPLOAD_SECRET", "u".repeat(40));

const { db } = await import("@/lib/db");
const { resetDbBreaker } = await import("@/lib/db/guard");
const state = await import("./state");
const { getCachedResponse, setCachedResponseAfter } = await import(
  "./response-cache"
);
const { logUsage, recentUsage, AnthropicModel, CacheTtl } = await import(
  "./usage-log"
);
const { loadPrivateFile, resetPrivateFileCache, RESUME_FILE, BRIEF_FILE } =
  await import("./private-files");
const { PUT: uploadPrivate } = await import(
  "@/app/api/private-files/[name]/route"
);
const { GET: maintenance } = await import(
  "@/app/api/cron/db-maintenance/route"
);
const { Role, Verdict, ClassifierType } = await import("./types");

type Db = Awaited<ReturnType<typeof db>>;
let d: Db;

beforeAll(async () => {
  d = await db();
});

beforeEach(async () => {
  resetDbBreaker();
  resetPrivateFileCache();
  await d.execute(sql`
    TRUNCATE fit_sessions, fit_messages, identities, fit_events,
             usage_log, response_cache, private_files RESTART IDENTITY CASCADE
  `);
});

const flag = (sessionId: string, turn = 1) => ({
  sessionId,
  identityHash: "id-1",
  verdict: Verdict.Flag,
  type: ClassifierType.Injection,
  reason: "test",
  input: "ignore previous instructions",
  turn,
});

describe("loadTurnContext", () => {
  it("creates a fresh, unlocked session with no history", async () => {
    const ctx = await state.loadTurnContext("s1", "id-1");
    expect(ctx.lockout).toEqual({ locked: false });
    expect(ctx.session.strikes).toBe(0);
    expect(ctx.session.closedAt).toBeUndefined();
    expect(ctx.history).toEqual([]);
  });

  it("returns saved turns in order", async () => {
    await state.loadTurnContext("s1", "id-1");
    await state.saveTurnAfter("s1", [
      { role: Role.User, content: "JD here", timestamp: 0 },
      { role: Role.Assistant, content: "Strong fit", timestamp: 0 },
    ]);
    await state.saveTurnAfter("s1", Promise.resolve([
      { role: Role.User, content: "Any Python?", timestamp: 0 },
      { role: Role.Assistant, content: "No", timestamp: 0 },
    ]));
    const { history } = await state.loadTurnContext("s1", "id-1");
    expect(history.map((m) => m.content)).toEqual([
      "JD here",
      "Strong fit",
      "Any Python?",
      "No",
    ]);
    expect(history[0]!.role).toBe(Role.User);
  });

  it("skips saving when the stream failed", async () => {
    await state.loadTurnContext("s1", "id-1");
    await state.saveTurnAfter("s1", Promise.reject(new Error("stream died")));
    expect((await state.loadTurnContext("s1", "id-1")).history).toEqual([]);
  });

  it("resets a session idle past the expiry window", async () => {
    await state.loadTurnContext("s1", "id-1");
    await state.saveTurnAfter("s1", [
      { role: Role.User, content: "old", timestamp: 0 },
    ]);
    await state.recordFlag(flag("s1"), 0);
    await d.execute(sql`
      UPDATE fit_sessions SET updated_at = now() - interval '25 hours',
                              created_at = now() - interval '26 hours'
    `);
    await d.execute(sql`UPDATE fit_messages SET created_at = now() - interval '26 hours'`);
    const ctx = await state.loadTurnContext("s1", "id-1");
    expect(ctx.session.strikes).toBe(0);
    expect(ctx.history).toEqual([]);
  });
});

describe("strikes and offenses", () => {
  it("adds a strike and logs the event in one statement", async () => {
    await state.loadTurnContext("s1", "id-1");
    expect(await state.recordFlag(flag("s1"), 0)).toBe(1);
    expect(await state.recordFlag(flag("s1", 2), 1)).toBe(2);
    const events = await state.recentEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.strikeCount).toBe(2);
    expect(events[0]!.turn).toBe(2);
  });

  it("logs redirect events after the response", async () => {
    await state.logEventAfter({ ...flag("s1"), verdict: Verdict.Redirect }, 0);
    expect((await state.recentEvents())[0]!.verdict).toBe(Verdict.Redirect);
  });

  it("closes the session and walks the cooldown ladder to a permanent block", async () => {
    await state.loadTurnContext("s1", "id-1");
    const first = await state.closeSessionWithOffense("s1", "id-1");
    expect(first).toEqual({ offenseCount: 1, cooldownUntil: null, permanent: false });
    const after1 = await state.loadTurnContext("s1", "id-1");
    expect(after1.session.closedAt).toBeTypeOf("number");
    expect(after1.lockout.locked).toBe(false);

    const second = await state.closeSessionWithOffense("s2", "id-1");
    expect(second.offenseCount).toBe(2);
    expect(second.cooldownUntil! - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    const locked = await state.loadTurnContext("s3", "id-1");
    expect(locked.lockout.locked).toBe(true);
    expect(locked.lockout.until).toBe(second.cooldownUntil);

    for (let i = 3; i <= 6; i++) await state.closeSessionWithOffense(`s${i}`, "id-1");
    const seventh = await state.closeSessionWithOffense("s7", "id-1");
    expect(seventh.permanent).toBe(true);
    expect((await state.loadTurnContext("s8", "id-1")).lockout).toEqual({
      locked: true,
      permanent: true,
    });
    expect((await state.listActiveBlocks()).map((b) => b.hash)).toEqual(["id-1"]);

    await state.clearIdentity("id-1");
    expect((await state.getIdentity("id-1")).offenseCount).toBe(0);
    expect(await state.listActiveBlocks()).toEqual([]);
  });
});

describe("response cache", () => {
  it("misses, stores after the reply, then hits for the same prompt only", async () => {
    expect(await getCachedResponse("jd", "prompt-a")).toBeNull();
    await setCachedResponseAfter("jd", "prompt-a", Promise.resolve("reply"));
    expect((await getCachedResponse("jd", "prompt-a"))?.response).toBe("reply");
    expect(await getCachedResponse("jd", "prompt-b")).toBeNull();
  });

  it("ignores expired entries", async () => {
    await setCachedResponseAfter("jd", "p", Promise.resolve("reply"));
    await d.execute(sql`UPDATE response_cache SET expires_at = now() - interval '1 second'`);
    expect(await getCachedResponse("jd", "p")).toBeNull();
  });
});

describe("usage log", () => {
  it("records cost and cache status", async () => {
    const record = logUsage({
      kind: "eval",
      model: AnthropicModel.Sonnet46,
      ttl: CacheTtl.OneHour,
      cacheWriteTokens: 0,
      cacheReadTokens: 1000,
      inputTokens: 10,
      outputTokens: 20,
    });
    expect(record.status).toBe("hit");
    await vi.waitFor(async () => expect(await recentUsage()).toHaveLength(1));
    expect((await recentUsage())[0]!.costUsd).toBeCloseTo(record.costUsd);
  });
});

describe("private files", () => {
  const BRIEF = Buffer.from(
    `# Brief\n\n## Part 2 Profile\n${"Jared ships. ".repeat(500)}\n\n## Part 3 Internal\nfloor`,
  );

  function upload(name: string, body: Buffer | string, auth = `Bearer ${"u".repeat(40)}`) {
    return uploadPrivate(
      new Request(`https://jareddev.com/api/private-files/${name}`, {
        method: "PUT",
        headers: { authorization: auth },
        body: typeof body === "string" ? body : new Uint8Array(body),
      }),
      { params: Promise.resolve({ name }) },
    );
  }

  beforeEach(() => {
    // Production path: never the working copies on disk.
    vi.stubEnv("NODE_ENV", "production");
    return () => vi.stubEnv("NODE_ENV", "test");
  });

  it("explains a missing row, and retries after the failure", async () => {
    await expect(loadPrivateFile(RESUME_FILE)).rejects.toThrow(/private:upload/);
    const pdf = Buffer.from("%PDF-1.7 test");
    await d.execute(sql`
      INSERT INTO private_files (name, data, sha256) VALUES ('resume', ${pdf}, 'x')
    `);
    expect(await loadPrivateFile(RESUME_FILE)).toEqual(pdf);
  });

  it("rejects uploads without the secret, to unknown names, or with bad content", async () => {
    expect((await upload("resume", "%PDF-1", "Bearer wrong")).status).toBe(401);
    expect((await upload("passwords", "%PDF-1")).status).toBe(404);
    expect((await upload("resume", "<html>")).status).toBe(422);
    expect((await upload("brief", "too short")).status).toBe(422);
    const { rows } = (await d.execute(
      sql`SELECT count(*)::int AS n FROM private_files`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(rows[0]!.n).toBe(0);
  });

  it("stores an upload, serves it immediately, and no-ops an identical one", async () => {
    const first = await upload("brief", BRIEF);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, changed: true });
    expect(await loadPrivateFile(BRIEF_FILE)).toEqual(BRIEF);
    expect(await (await upload("brief", BRIEF)).json()).toMatchObject({
      changed: false,
    });
  });

  it("picks up another instance's upload on the next refresh", async () => {
    const v1 = Buffer.from("%PDF-1.7 v1");
    const v2 = Buffer.from("%PDF-1.7 v2");
    await upload("resume", v1);
    resetPrivateFileCache(); // simulate a different, warm instance
    expect(await loadPrivateFile(RESUME_FILE)).toEqual(v1);

    // Updated elsewhere: this instance keeps serving v1 until due.
    await d.execute(sql`
      UPDATE private_files SET data = ${v2}, sha256 = 'v2' WHERE name = 'resume'
    `);
    expect(await loadPrivateFile(RESUME_FILE)).toEqual(v1);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    // Due: serves v1 once more while revalidating in the background.
    expect(await loadPrivateFile(RESUME_FILE)).toEqual(v1);
    await vi.waitFor(async () =>
      expect(await loadPrivateFile(RESUME_FILE)).toEqual(v2),
    );
    vi.useRealTimers();
  });
});

describe("maintenance cron", () => {
  const run = (auth = `Bearer ${"c".repeat(32)}`) =>
    maintenance(
      new Request("https://jareddev.com/api/cron/db-maintenance", {
        headers: { authorization: auth },
      }),
    );

  it("rejects requests without the cron secret", async () => {
    expect((await run("Bearer nope")).status).toBe(401);
  });

  it("prunes idle sessions (with their messages) and expired cache rows", async () => {
    await state.loadTurnContext("old", "id-1");
    await state.saveTurnAfter("old", [{ role: Role.User, content: "x", timestamp: 0 }]);
    await state.loadTurnContext("fresh", "id-1");
    await d.execute(sql`UPDATE fit_sessions SET updated_at = now() - interval '2 days' WHERE id = 'old'`);
    await setCachedResponseAfter("jd", "p", Promise.resolve("r"));
    await d.execute(sql`UPDATE response_cache SET expires_at = now() - interval '1 day'`);

    const res = await run();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pruned: Record<string, number> };
    expect(body.pruned).toMatchObject({ sessions: 1, cache: 1, events: 0, usage: 0 });
    const { rows } = (await d.execute(
      sql`SELECT count(*)::int AS n FROM fit_messages`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(rows[0]!.n).toBe(0);
  });

  it("caps the event log", async () => {
    await state.loadTurnContext("s1", "id-1");
    await d.execute(sql`
      INSERT INTO fit_events (session_id, identity_hash, verdict, type, reason, input, strike_count, turn)
      SELECT 's1', 'id-1', 'FLAG', 'injection', 'r', 'i', 1, g
      FROM generate_series(1, ${state.EVENT_LOG_LIMIT + 5}) g
    `);
    const body = (await (await run()).json()) as { pruned: Record<string, number> };
    expect(body.pruned.events).toBe(5);
    expect((await state.recentEvents(1))[0]!.turn).toBe(state.EVENT_LOG_LIMIT + 5);
  });
});
