import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redis } from "@/lib/redis";

/**
 * Loads the bot's source-of-truth brief at module init.
 *
 * Production: brief is stored in Upstash under `bot:brief`, uploaded by
 * the `npm run brief:upload` script (also wired to a git pre-push hook
 * so it stays in sync on every push).
 *
 * Dev: if Redis lookup fails or returns nothing, falls back to reading
 * the local PROFILE_BRIEF.md from disk. Lets you iterate on the brief
 * locally without needing to re-upload after every edit.
 *
 * The loader runs once when this module is first imported (top-level
 * await) and caches the parsed Part 2 in module scope. Subsequent calls
 * to `profileContent()` are zero-cost.
 *
 * IMPORTANT: this module must not be imported by anything that runs at
 * build time (prerendered pages). Only the /api/fit serverless function
 * chain imports it, so the Redis fetch happens at cold start, not during
 * `next build`. `profile.ts` holds the build-safe constants.
 */

const BRIEF_KEY = "bot:brief";
const BRIEF_MIN_LENGTH = 5000;

async function fetchBriefFromRedis(): Promise<string | null> {
  try {
    const content = await redis().get<string>(BRIEF_KEY);
    if (content && content.length >= BRIEF_MIN_LENGTH) return content;
    if (content) {
      console.warn(
        `[brief] Redis key "${BRIEF_KEY}" returned ${content.length} chars; below minimum threshold (${BRIEF_MIN_LENGTH}). Falling back to disk.`,
      );
    }
    return null;
  } catch (err) {
    console.warn("[brief] Redis fetch failed, will try disk:", err);
    return null;
  }
}

function readBriefFromDisk(): string | null {
  const briefPath = join(process.cwd(), "PROFILE_BRIEF.md");
  if (!existsSync(briefPath)) return null;
  try {
    return readFileSync(briefPath, "utf-8");
  } catch {
    return null;
  }
}

function slicePart2(brief: string): string {
  const part2Start = brief.indexOf("## Part 2");
  const part3Start = brief.indexOf("## Part 3");
  if (part2Start === -1 || part3Start === -1 || part3Start <= part2Start) {
    throw new Error(
      "Brief is missing the ## Part 2 / ## Part 3 markers. Cannot slice profile content.",
    );
  }
  const slice = brief.slice(part2Start, part3Start).trim();
  const withoutHeading = slice.replace(/^## Part 2[^\n]*\n/, "");
  return withoutHeading.replace(/\n---\s*$/, "").trim();
}

async function loadBriefOnce(): Promise<string> {
  const fromRedis = await fetchBriefFromRedis();
  if (fromRedis) {
    return slicePart2(fromRedis);
  }
  const fromDisk = readBriefFromDisk();
  if (fromDisk) {
    console.warn(
      "[brief] Loaded brief from local disk (Redis was empty or unreachable). Run `npm run brief:upload` to populate Redis.",
    );
    return slicePart2(fromDisk);
  }
  throw new Error(
    `Brief not available: Redis key "${BRIEF_KEY}" is empty AND PROFILE_BRIEF.md is not on disk. Run \`npm run brief:upload\` from a machine that has the file locally.`,
  );
}

// Top-level await: blocks module evaluation until the brief is loaded.
// From any consumer's perspective, `profileContent()` is a simple sync
// accessor once this module is imported.
const PROFILE_CONTENT: string = await loadBriefOnce();

export function profileContent(): string {
  return PROFILE_CONTENT;
}
