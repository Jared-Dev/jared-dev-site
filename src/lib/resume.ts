/**
 * Client-safe resume constants. No fs, no crypto: imported by client
 * components (ContactReveal, FitTool) and by the Fit Bot prompt.
 *
 * The PDF carries the email and phone the /contact gate keeps out of
 * the HTML, and this repo is public, so it never ships in git. It lives
 * in Postgres (see private-files.ts) and /api/resume serves it only to a
 * visitor holding the verified-visitor cookie.
 */

export const RESUME_PATH = "/api/resume";
export const RESUME_DOWNLOAD_PATH = `${RESUME_PATH}?download=1`;
export const RESUME_FILENAME = "Jared-Malcolm-Resume.pdf";

/** True for any href that points at the gated resume endpoint. */
export function isResumeHref(href: string | undefined): boolean {
  if (!href) return false;
  return href === RESUME_PATH || href.startsWith(`${RESUME_PATH}?`);
}
