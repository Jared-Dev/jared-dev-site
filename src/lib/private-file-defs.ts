/**
 * Definitions of the private files (the Fit Bot brief and the resume):
 * names, local working-copy paths, and content validation. Dependency
 * free, so the sync CLI (scripts/private-sync.ts) can use it without
 * loading the database client. Server-side loading lives in
 * private-files.ts.
 */

import { createHash } from "node:crypto";

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
