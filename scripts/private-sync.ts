/**
 * Syncs the gitignored private files (PROFILE_BRIEF.md, resume.pdf)
 * with the live site, via /api/private-files/{brief|resume}. Works from
 * any of Jared's machines; no commit or deploy involved.
 *
 *   pnpm run private:download               # pull both from the site
 *   pnpm run private:upload                 # push local edits (pre-push hook runs this)
 *   pnpm run private:upload -- resume       # just one file
 *   pnpm run private:upload -- --force      # overwrite whatever is stored
 *   pnpm run private:download -- --force    # overwrite unsynced local edits
 *   ... -- --url http://localhost:3000      # another site (default jareddev.com)
 *
 * Needs PRIVATE_UPLOAD_SECRET in .env.local, matching Vercel. Target:
 * --url, else PRIVATE_UPLOAD_URL, else https://jareddev.com.
 *
 * Safety, git-style: .private-sync.json (gitignored) records the hash
 * each file had when this machine last synced it.
 *  - upload skips files you haven't edited since that sync (no request),
 *    and sends the recorded hash as If-Match, so if another machine
 *    pushed a newer copy since, the server refuses (412) instead of
 *    letting an old copy win. Download, re-apply your edit, upload.
 *  - download refuses to overwrite a local file you've edited since the
 *    last sync when the site's copy differs.
 * --force skips both checks.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVATE_FILES, type PrivateFile } from "../src/lib/private-file-defs";

const DEFAULT_URL = "https://jareddev.com";
const STATE_FILE = ".private-sync.json";

type Mode = "upload" | "download";
type SyncState = Record<string, string>; // file name → last synced sha256

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function readState(): SyncState {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), STATE_FILE), "utf8")) as SyncState;
  } catch {
    return {};
  }
}

function writeState(state: SyncState): void {
  writeFileSync(join(process.cwd(), STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function readLocal(file: PrivateFile): Buffer | null {
  const path = join(process.cwd(), file.plain);
  return existsSync(path) ? readFileSync(path) : null;
}

interface Ctx {
  base: string;
  auth: string;
  force: boolean;
  state: SyncState;
  log: (msg: string) => void;
  fail: (msg: string) => void;
}

async function upload(file: PrivateFile, c: Ctx): Promise<void> {
  const local = readLocal(file);
  if (!local) return c.log(`${file.plain} not on disk, skipped.`);
  const hash = sha256(local);
  const synced = c.state[file.name];
  if (!c.force && synced === hash) return c.log(`${file.plain} unchanged since last sync.`);
  const problem = file.validate(local);
  if (problem) return c.fail(`Refusing ${file.plain}: ${problem}.`);

  const conditional: Record<string, string> = c.force
    ? {}
    : synced
      ? { "If-Match": `"${synced}"` }
      : { "If-None-Match": "*" };
  const res = await fetch(`${c.base}/api/private-files/${file.name}`, {
    method: "PUT",
    headers: {
      Authorization: c.auth,
      "Content-Type": "application/octet-stream",
      ...conditional,
    },
    body: new Uint8Array(local),
  });
  const body = (await res.json().catch(() => null)) as {
    changed?: boolean;
    error?: string;
  } | null;
  if (res.status === 412) {
    return c.fail(
      `${file.plain}: the site has a different copy than this machine last synced (edited elsewhere?). ` +
        `Run \`pnpm run private:download\` (add --force to discard local edits) and re-apply, ` +
        `or \`pnpm run private:upload -- --force\` to overwrite.`,
    );
  }
  if (!res.ok) return c.fail(`${file.plain}: HTTP ${res.status} ${body?.error ?? ""}`.trim());
  c.state[file.name] = hash;
  c.log(
    body?.changed
      ? `Uploaded ${file.plain} (${(local.length / 1024).toFixed(1)} KB) to ${c.base}.`
      : `${file.plain} already matches ${c.base}.`,
  );
}

async function download(file: PrivateFile, c: Ctx): Promise<void> {
  const res = await fetch(`${c.base}/api/private-files/${file.name}`, {
    headers: { Authorization: c.auth },
  });
  if (res.status === 404) return c.log(`${file.name}: nothing stored on ${c.base} yet, skipped.`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return c.fail(`${file.name}: HTTP ${res.status} ${body?.error ?? ""}`.trim());
  }
  const remote = Buffer.from(await res.arrayBuffer());
  const remoteHash = sha256(remote);
  const local = readLocal(file);
  if (local && sha256(local) === remoteHash) {
    c.state[file.name] = remoteHash;
    return c.log(`${file.plain} already up to date.`);
  }
  const editedLocally = local && sha256(local) !== c.state[file.name];
  if (editedLocally && !c.force) {
    return c.fail(
      `${file.plain} has local edits that were never uploaded, and the site's copy differs. ` +
        `Upload them (\`pnpm run private:upload\`) or discard with \`pnpm run private:download -- --force\`.`,
    );
  }
  writeFileSync(join(process.cwd(), file.plain), remote);
  c.state[file.name] = remoteHash;
  c.log(`Downloaded ${file.plain} (${(remote.length / 1024).toFixed(1)} KB) from ${c.base}.`);
}

async function main(): Promise<number> {
  const mode = process.argv[2] as Mode;
  if (mode !== "upload" && mode !== "download") {
    console.error("usage: private-sync.ts <upload|download> [brief|resume] [--force] [--url URL]");
    return 2;
  }
  const tag = `[private:${mode}]`;
  const secret = process.env.PRIVATE_UPLOAD_SECRET;
  if (!secret || secret.length < 16) {
    console.error(
      `${tag} PRIVATE_UPLOAD_SECRET is missing in .env.local. Copy it from another machine's .env.local (it must match Vercel).`,
    );
    return 1;
  }
  const args = process.argv.slice(3);
  const urlIndex = args.indexOf("--url");
  const base = (
    (urlIndex !== -1 ? args[urlIndex + 1] : undefined) ??
    process.env.PRIVATE_UPLOAD_URL ??
    DEFAULT_URL
  ).replace(/\/+$/, "");
  const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--url");

  let failed = 0;
  const c: Ctx = {
    base,
    auth: `Bearer ${secret}`,
    force: args.includes("--force"),
    state: readState(),
    log: (msg) => console.log(`${tag} ${msg}`),
    fail: (msg) => {
      failed++;
      console.error(`${tag} ${msg}`);
    },
  };
  for (const file of PRIVATE_FILES) {
    if (only.length > 0 && !only.includes(file.name)) continue;
    try {
      await (mode === "upload" ? upload(file, c) : download(file, c));
    } catch (err) {
      c.fail(`${file.plain}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  writeState(c.state);
  return failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
