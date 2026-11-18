/**
 * Pushes the gitignored private files (PROFILE_BRIEF.md, resume.pdf) to
 * the site's upload endpoint, PUT /api/private-files/{brief|resume}.
 * Changes go live within five minutes, no commit or deploy.
 *
 *   pnpm run private:upload                          # → https://jareddev.com
 *   pnpm run private:upload -- --url http://localhost:3000
 *   pnpm run private:upload -- resume                # just one file
 *
 * Needs PRIVATE_UPLOAD_SECRET in .env.local, matching the value in
 * Vercel. Target URL: --url, else PRIVATE_UPLOAD_URL, else production.
 * Also run by the git pre-push hook.
 *
 * A file that isn't on disk is skipped. Files are validated locally
 * first (same checks the server runs) so a bad file fails fast.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVATE_FILES } from "../src/lib/private-files";

const DEFAULT_URL = "https://jareddev.com";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<number> {
  const secret = process.env.PRIVATE_UPLOAD_SECRET;
  if (!secret || secret.length < 16) {
    console.error(
      "[private:upload] PRIVATE_UPLOAD_SECRET is missing or too short in .env.local (generate with: openssl rand -base64 48, and set the same value in Vercel).",
    );
    return 1;
  }
  const base = (arg("--url") ?? process.env.PRIVATE_UPLOAD_URL ?? DEFAULT_URL)
    .replace(/\/+$/, "");
  const only = process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--url");

  let failed = 0;
  for (const file of PRIVATE_FILES) {
    if (only.length > 0 && !only.includes(file.name)) continue;
    const path = join(process.cwd(), file.plain);
    if (!existsSync(path)) {
      console.log(`[private:upload] ${file.plain} not on disk, skipped.`);
      continue;
    }
    const bytes = readFileSync(path);
    const problem = file.validate(bytes);
    if (problem) {
      console.error(`[private:upload] Refusing ${file.plain}: ${problem}.`);
      failed++;
      continue;
    }
    try {
      const res = await fetch(`${base}/api/private-files/${file.name}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(bytes),
      });
      const body = (await res.json().catch(() => null)) as {
        changed?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        console.error(
          `[private:upload] ${file.plain}: HTTP ${res.status} ${body?.error ?? ""}`.trim(),
        );
        failed++;
        continue;
      }
      console.log(
        body?.changed
          ? `[private:upload] Uploaded ${file.plain} (${(bytes.length / 1024).toFixed(1)} KB) to ${base}.`
          : `[private:upload] ${file.plain} unchanged on ${base}.`,
      );
    } catch (err) {
      console.error(
        `[private:upload] ${file.plain}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
