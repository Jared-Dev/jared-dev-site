/**
 * Server-side loader for content that must not live in this public
 * repo: the Fit Bot brief (comp floor, honest gaps) and the resume PDF
 * (email + phone).
 *
 * The plaintext files are gitignored working copies at the repo root.
 * `pnpm run private:upload` (also run by the pre-push hook) PUTs them to
 * /api/private-files/[name], which validates and stores them in
 * Postgres (private_files); production reads them from there. Local dev
 * reads the file on disk when present, so edits show up immediately.
 *
 * Each instance keeps the bytes in memory and revalidates at most every
 * REFRESH_MS in the background: the check selects only the SHA-256 and
 * pulls the bytes only when they changed, so an update goes live within
 * a few minutes without a deploy, and a database blip during a refresh
 * keeps serving the last good copy. A failed first load isn't cached,
 * so the next request retries.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sha256Hex, type PrivateFile } from "@/lib/private-file-defs";

export {
  BRIEF_FILE,
  PRIVATE_FILES,
  RESUME_FILE,
  looksLikePdf,
  privateFileByName,
  sha256Hex,
  type PrivateFile,
} from "@/lib/private-file-defs";

const REFRESH_MS = 5 * 60 * 1000;

interface Entry {
  bytes: Buffer | null;
  sha256: string | null;
  checkedAt: number;
  pending: Promise<Buffer> | null;
}

const entries = new Map<string, Entry>();

function readPlain(file: PrivateFile): Buffer | null {
  // Dev only (see fetchLatest). turbopackIgnore keeps the tracer from
  // pulling the whole project, including these gitignored files, into
  // the production function.
  const path = join(/*turbopackIgnore: true*/ process.cwd(), file.plain);
  return existsSync(path) ? readFileSync(path) : null;
}

/**
 * The current bytes. With a known hash, the row's data is only selected
 * when the stored hash differs, so an unchanged check moves ~64 bytes.
 */
async function fetchLatest(file: PrivateFile, entry: Entry): Promise<Buffer> {
  if (process.env.NODE_ENV !== "production") {
    const local = readPlain(file);
    if (local) return local;
  }
  const d = await db();
  const known = entry.sha256 ?? "";
  const { rows } = (await d.execute(sql`
    SELECT sha256, CASE WHEN sha256 <> ${known} THEN data END AS data
    FROM private_files WHERE name = ${file.name}
  `)) as unknown as { rows: Array<{ sha256: string; data: Uint8Array | null }> };
  const row = rows[0];
  if (!row) {
    throw new Error(
      `private_files has no "${file.name}" row. Run \`pnpm run private:upload\`.`,
    );
  }
  if (!row.data && entry.bytes) return entry.bytes; // unchanged
  const bytes = Buffer.from(row.data!);
  const problem = file.validate(bytes);
  if (problem) throw new Error(`${file.name}: ${problem}`);
  entry.sha256 = row.sha256;
  return bytes;
}

function refresh(file: PrivateFile, entry: Entry): Promise<Buffer> {
  const pending = fetchLatest(file, entry)
    .then((bytes) => {
      entry.bytes = bytes;
      return bytes;
    })
    .finally(() => {
      entry.checkedAt = Date.now();
      entry.pending = null;
    });
  entry.pending = pending;
  return pending;
}

/** The file's bytes; throws with a specific reason when never loaded. */
export function loadPrivateFile(file: PrivateFile): Promise<Buffer> {
  let entry = entries.get(file.name);
  if (!entry) {
    entry = { bytes: null, sha256: null, checkedAt: 0, pending: null };
    entries.set(file.name, entry);
  }
  if (entry.bytes) {
    // Serve what we have; revalidate in the background when due. A
    // failed revalidation keeps the last good copy.
    if (!entry.pending && Date.now() - entry.checkedAt > REFRESH_MS) {
      refresh(file, entry).catch((err: unknown) =>
        console.warn(`[private-files] refresh of "${file.name}" failed:`, err),
      );
    }
    return Promise.resolve(entry.bytes);
  }
  return entry.pending ?? refresh(file, entry);
}

/**
 * Optimistic-concurrency guard for uploads, so a machine with an older
 * copy can't silently overwrite newer content:
 *  - `ifMatch`: the SHA-256 this upload was based on; refused if the
 *    stored copy has since changed.
 *  - `ifNoneMatch`: only create; refused if a different copy exists.
 * Neither (a forced upload) always writes.
 */
export interface StorePrecondition {
  ifMatch?: string;
  ifNoneMatch?: boolean;
}

export type StoreResult =
  | { status: "stored"; changed: boolean; sha256: string }
  | { status: "conflict"; current: string };

/**
 * Validates and stores new content (the upload endpoint). Updates this
 * instance's copy immediately; others pick it up on their next refresh.
 * Uploading content identical to what's stored always succeeds as a
 * no-op, whatever the precondition.
 */
export async function storePrivateFile(
  file: PrivateFile,
  bytes: Buffer,
  pre: StorePrecondition = {},
): Promise<StoreResult> {
  const problem = file.validate(bytes);
  if (problem) throw new InvalidPrivateFileError(problem);
  const sha256 = sha256Hex(bytes);
  const allowUpdate = pre.ifNoneMatch
    ? sql`false`
    : pre.ifMatch
      ? sql`private_files.sha256 = ${pre.ifMatch}`
      : sql`true`;
  const d = await db();
  // One statement: write if allowed and different, and report the stored
  // hash either way (the inserted/updated row, or the untouched one).
  const { rows } = (await d.execute(sql`
    WITH up AS (
      INSERT INTO private_files (name, data, sha256)
      VALUES (${file.name}, ${bytes}, ${sha256})
      ON CONFLICT (name) DO UPDATE
        SET data = excluded.data, sha256 = excluded.sha256, updated_at = now()
        WHERE private_files.sha256 IS DISTINCT FROM excluded.sha256
          AND ${allowUpdate}
      RETURNING sha256
    )
    SELECT (SELECT sha256 FROM up) AS written,
           (SELECT sha256 FROM private_files WHERE name = ${file.name}) AS current
  `)) as unknown as {
    rows: Array<{ written: string | null; current: string | null }>;
  };
  const { written, current } = rows[0]!;
  if (!written && current !== sha256) {
    return { status: "conflict", current: current ?? "" };
  }
  entries.set(file.name, {
    bytes,
    sha256,
    checkedAt: Date.now(),
    pending: null,
  });
  return { status: "stored", changed: written !== null, sha256 };
}

/** The stored copy as-is (the download endpoint), or null if never uploaded. */
export async function readStoredPrivateFile(
  file: PrivateFile,
): Promise<{ bytes: Buffer; sha256: string; updatedAt: string } | null> {
  const d = await db();
  const { rows } = (await d.execute(sql`
    SELECT data, sha256, updated_at::text AS updated_at
    FROM private_files WHERE name = ${file.name}
  `)) as unknown as {
    rows: Array<{ data: Uint8Array; sha256: string; updated_at: string }>;
  };
  const row = rows[0];
  return row
    ? { bytes: Buffer.from(row.data), sha256: row.sha256, updatedAt: row.updated_at }
    : null;
}

export class InvalidPrivateFileError extends Error {}

/** Test hook. */
export function resetPrivateFileCache(): void {
  entries.clear();
}
