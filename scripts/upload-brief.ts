/**
 * Uploads PROFILE_BRIEF.md to Upstash under the key `bot:brief`.
 *
 * The brief is the source-of-truth document for the Fit Bot. It is
 * gitignored (contains the comp floor, honest gaps, and other material
 * that should not ship in a public repo), so it has to travel out-of-band
 * to production. This script is the out-of-band channel.
 *
 * Invocations:
 *   npm run brief:upload            # pushes the local copy to Redis
 *
 * It is wired into a git pre-push hook so every push refreshes Redis
 * with whatever is on disk. That keeps prod in sync without anyone
 * having to remember.
 *
 * Safety:
 *  - Reads from the working tree, not the index. If you've staged the
 *    file but not saved, you'll get the saved version. That's the
 *    behavior we want for "what is currently on disk."
 *  - Verifies the Part 2 / Part 3 markers are present before uploading
 *    so we never push a half-edited brief.
 *  - Refuses to upload if the file is suspiciously short (< 5000 chars).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redis } from "../src/lib/redis";

const BRIEF_KEY = "bot:brief";
const BRIEF_MIN_LENGTH = 5000;

async function main(): Promise<void> {
  const briefPath = join(process.cwd(), "PROFILE_BRIEF.md");

  if (!existsSync(briefPath)) {
    console.error(
      `[brief:upload] PROFILE_BRIEF.md not found at ${briefPath}. Nothing to upload.`,
    );
    process.exit(1);
  }

  const content = readFileSync(briefPath, "utf-8");

  if (content.length < BRIEF_MIN_LENGTH) {
    console.error(
      `[brief:upload] Refusing to upload: brief is ${content.length} chars (minimum ${BRIEF_MIN_LENGTH}). Did the file get truncated?`,
    );
    process.exit(1);
  }

  const part2 = content.indexOf("## Part 2");
  const part3 = content.indexOf("## Part 3");
  if (part2 === -1 || part3 === -1 || part3 <= part2) {
    console.error(
      "[brief:upload] Refusing to upload: missing or malformed ## Part 2 / ## Part 3 markers.",
    );
    process.exit(1);
  }

  await redis().set(BRIEF_KEY, content);

  const sizeKb = (content.length / 1024).toFixed(1);
  console.log(
    `[brief:upload] Uploaded ${content.length} chars (${sizeKb} KB) to Redis key "${BRIEF_KEY}".`,
  );
}

main().catch((err: unknown) => {
  console.error("[brief:upload] Failed:", err);
  process.exit(1);
});
