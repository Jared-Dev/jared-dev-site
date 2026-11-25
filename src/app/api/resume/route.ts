/**
 * Serves Jared's resume PDF to verified visitors only.
 *
 * The PDF carries the email and phone that /contact keeps behind
 * Turnstile, so it is not in public/ (or in this public repo); it's
 * stored in Postgres (private-files.ts). A visitor gets the
 * verified-visitor cookie by clearing Turnstile on /contact or in the
 * Fit Tool; without it this route redirects to /contact, where the gate
 * hands out the cookie and a download link.
 *
 * ?download=1 sends it as an attachment; otherwise it opens inline.
 */

import { RESUME_FILE, loadPrivateFile } from "@/lib/private-files";
import { RESUME_FILENAME } from "@/lib/resume";
import { isVerifiedVisitor } from "@/lib/verified-visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isVerifiedVisitor(req)) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL("/contact", req.url).toString(),
        "Cache-Control": "no-store",
      },
    });
  }

  let pdf: Buffer;
  try {
    pdf = await loadPrivateFile(RESUME_FILE);
  } catch (err) {
    console.error("[resume] unavailable:", err);
    return new Response(
      "Resume is temporarily unavailable. Try again shortly, or reach Jared via jareddev.com/contact.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${RESUME_FILENAME}"`,
      // Gated content: never let a shared cache or the browser's
      // back-forward cache hand it to someone without the cookie.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
