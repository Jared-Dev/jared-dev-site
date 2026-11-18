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

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface PrivateFile {
  /** Row key in private_files. */
  name: string;
  /** Gitignored working copy (repo-root relative). */
  plain: string;
  /** Rejects content that isn't the expected kind of file. */
  validate: (bytes: Buffer) => string | null;
}

const PDF_MAGIC = "%PDF-";
const BRIEF_MIN_LENGTH = 5000;

export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC.length &&
    Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") ===
      PDF_MAGIC
  );
}

export const BRIEF_FILE: PrivateFile = {
  name: "brief",
  plain: "PROFILE_BRIEF.md",
  validate: (bytes) => {
    const text = bytes.toString("utf8");
    if (text.length < BRIEF_MIN_LENGTH) {
      return `brief is ${text.length} chars (minimum ${BRIEF_MIN_LENGTH}); was it truncated?`;
    }
    const part2 = text.indexOf("## Part 2");
    const part3 = text.indexOf("## Part 3");
    if (part2 === -1 || part3 === -1 || part3 <= part2) {
      return "brief is missing the ## Part 2 / ## Part 3 markers";
    }
    return null;
  },
};

export const RESUME_FILE: PrivateFile = {
  name: "resume",
  plain: "resume.pdf",
  validate: (bytes) => (looksLikePdf(bytes) ? null : "resume is not a PDF"),
};

export const PRIVATE_FILES: readonly PrivateFile[] = [BRIEF_FILE, RESUME_FILE];

export function privateFileByName(name: string): PrivateFile | undefined {
  return PRIVATE_FILES.find((f) => f.name === name);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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
 * Validates and stores new content (the upload endpoint). Updates this
 * instance's copy immediately; others pick it up on their next refresh.
 * Returns whether the stored bytes changed.
 */
export async function storePrivateFile(
  file: PrivateFile,
  bytes: Buffer,
): Promise<{ changed: boolean; sha256: string }> {
  const problem = file.validate(bytes);
  if (problem) throw new InvalidPrivateFileError(problem);
  const sha256 = sha256Hex(bytes);
  const d = await db();
  const { rows } = (await d.execute(sql`
    INSERT INTO private_files (name, data, sha256)
    VALUES (${file.name}, ${bytes}, ${sha256})
    ON CONFLICT (name) DO UPDATE
      SET data = excluded.data, sha256 = excluded.sha256, updated_at = now()
      WHERE private_files.sha256 IS DISTINCT FROM excluded.sha256
    RETURNING name
  `)) as unknown as { rows: unknown[] };
  entries.set(file.name, {
    bytes,
    sha256,
    checkedAt: Date.now(),
    pending: null,
  });
  return { changed: rows.length > 0, sha256 };
}

export class InvalidPrivateFileError extends Error {}

/** Test hook. */
export function resetPrivateFileCache(): void {
  entries.clear();
}
