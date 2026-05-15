/**
 * Turnstile verification for the /recommendation page.
 *
 * After a successful verify, mints a 30-minute session cookie so the
 * client can subsequently fetch /api/recommendation/contacts without
 * re-verifying. Also returns the contacts inline in this response so
 * the first verify call gets everything in one round-trip.
 *
 * The PDFs themselves live in public/ and are reachable by direct URL
 * regardless of this gate; the cookie protects the phone-number
 * endpoint (which is not in any client bundle) from drive-by scrapes.
 */

import { clientIp } from "@/lib/identity";
import { getRecommenderContacts } from "@/lib/recommendation-contacts";
import { mintRecommendationSession } from "@/lib/recommendation-session";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { turnstileToken?: string }
    | null;

  const token = body?.turnstileToken;
  if (!token || typeof token !== "string") {
    return jsonResponse(
      { ok: false, reason: "Missing verification token." },
      { status: 400 },
    );
  }

  const ok = await verifyTurnstile(token, clientIp(req));
  if (!ok) {
    return jsonResponse(
      { ok: false, reason: "Verification failed. Refresh and try again." },
      { status: 401 },
    );
  }

  const { setCookieHeader } = await mintRecommendationSession();
  return jsonResponse(
    { ok: true, contacts: getRecommenderContacts() },
    { headers: { "Set-Cookie": setCookieHeader } },
  );
}
