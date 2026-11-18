import { BRIEF_FILE, loadPrivateFile } from "@/lib/private-files";

/**
 * The Fit Bot's source-of-truth brief, Part 2 only.
 *
 * PROFILE_BRIEF.md is gitignored (comp floor, honest gaps). Production
 * reads it from Postgres (uploaded by `pnpm run private:upload`); local
 * dev reads the file on disk. Cached and revalidated per instance; see
 * private-files.ts.
 */

function slicePart2(brief: string): string {
  const part2Start = brief.indexOf("## Part 2");
  const part3Start = brief.indexOf("## Part 3");
  const slice = brief.slice(part2Start, part3Start).trim();
  const withoutHeading = slice.replace(/^## Part 2[^\n]*\n/, "");
  return withoutHeading.replace(/\n---\s*$/, "").trim();
}

let last: { bytes: Buffer; profile: string } | null = null;

/** Part 2 of the current brief, re-sliced only when the brief changes. */
export async function profileContent(): Promise<string> {
  const bytes = await loadPrivateFile(BRIEF_FILE);
  if (last?.bytes !== bytes) {
    last = { bytes, profile: slicePart2(bytes.toString("utf8")) };
  }
  return last.profile;
}
