/**
 * Turnstile verification for the /recommendation page.
 *
 * After a successful verify, sets the site's verified-visitor cookie
 * (30-minute rolling window) so the client can subsequently fetch
 * /api/recommendation/contacts without re-verifying. Also returns the
 * contacts inline so the first verify call gets everything in one
 * round-trip.
 *
 * The PDFs themselves live in public/ and are reachable by direct URL
 * regardless of this gate; the cookie protects the phone-number
 * endpoint (which is not in any client bundle) from drive-by scrapes.
 */

import { getRecommenderContacts } from "@/lib/recommendation-contacts";
import { passGate } from "@/lib/verified-visitor";

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

  const gate = await passGate(req, token);
  if (!gate.ok) {
    return jsonResponse(
      { ok: false, reason: "Verification failed. Refresh and try again." },
      { status: 401 },
    );
  }

  return jsonResponse(
    { ok: true, contacts: getRecommenderContacts() },
    gate.setCookie ? { headers: { "Set-Cookie": gate.setCookie } } : {},
  );
}
