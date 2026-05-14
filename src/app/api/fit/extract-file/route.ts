/**
 * Upload endpoint for recruiters who have a JD as a PDF or DOCX.
 *
 * The flow:
 *  1. Client POSTs multipart/form-data with `file`, `sessionId`,
 *     `turnstileToken`.
 *  2. We verify Turnstile (reusing the same rolling 30-minute session
 *     cache as /api/fit so multiple submits in a single session don't
 *     re-trigger the widget).
 *  3. We extract text via @/lib/jd-extract.
 *  4. We return the extracted text as JSON. The client populates the
 *     Fit Tool textarea with it so the recruiter can review/trim
 *     before hitting Send. The actual eval still runs through /api/fit.
 *
 * This split keeps file handling isolated from the streaming-eval
 * route and lets the recruiter see what got extracted (extraction
 * quality varies on multi-column PDFs and image-heavy DOCX).
 */

import { extractJdFromFile, SupportedJdMime } from "@/lib/jd-extract";
import { clientIp } from "@/lib/identity";
import { redis } from "@/lib/redis";
import { verifyTurnstile } from "@/lib/turnstile";

const SESSION_TURNSTILE_TTL_SECONDS = 30 * 60;
const sessionTurnstileKey = (sid: string) => `session:${sid}:turnstile_ok`;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse(
      { ok: false, reason: "Couldn't parse upload. Resend as multipart/form-data." },
      400,
    );
  }

  const sessionId = String(form.get("sessionId") ?? "");
  const turnstileToken = String(form.get("turnstileToken") ?? "");
  const file = form.get("file");

  if (!sessionId || sessionId.length > 128) {
    return jsonResponse({ ok: false, reason: "Missing sessionId." }, 400);
  }
  if (!turnstileToken) {
    return jsonResponse({ ok: false, reason: "Missing verification token." }, 400);
  }
  if (!(file instanceof File)) {
    return jsonResponse({ ok: false, reason: "No file attached." }, 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return jsonResponse(
      { ok: false, reason: `That file is ${mb} MB. Max is 5 MB.` },
      413,
    );
  }

  const declaredMime = file.type;
  if (declaredMime !== SupportedJdMime.Pdf && declaredMime !== SupportedJdMime.Docx) {
    return jsonResponse(
      { ok: false, reason: `Unsupported file type "${declaredMime || "unknown"}". Upload a PDF or DOCX.` },
      415,
    );
  }

  // Same Turnstile flow as /api/fit: first request in a session does the
  // real Cloudflare round-trip and caches the verified state for 30 min;
  // subsequent requests within that window just refresh the TTL.
  const ip = clientIp(req);
  const turnstileKey = sessionTurnstileKey(sessionId);
  const alreadyVerified = await redis().exists(turnstileKey);
  if (!alreadyVerified) {
    const ok = await verifyTurnstile(turnstileToken, ip);
    if (!ok) {
      return jsonResponse(
        { ok: false, reason: "Verification failed. Refresh and try again." },
        401,
      );
    }
    await redis().set(turnstileKey, 1, { ex: SESSION_TURNSTILE_TTL_SECONDS });
  } else {
    await redis().expire(turnstileKey, SESSION_TURNSTILE_TTL_SECONDS);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = await extractJdFromFile(file.name, declaredMime, buffer);

  if (!result.ok) {
    return jsonResponse(result, 422);
  }

  return jsonResponse({
    ok: true,
    text: result.text,
    filename: result.filename,
  });
}
