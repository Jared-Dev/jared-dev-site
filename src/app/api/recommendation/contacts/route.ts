/**
 * Returns recommender contact info (phone numbers, call-welcome text)
 * for the /recommendation page. Gated by the session cookie set in
 * /api/recommendation/verify: no valid cookie, no contacts.
 *
 * On valid cookie this also bumps the session TTL so an active visitor
 * doesn't get kicked back to re-verification mid-session.
 */

import { getRecommenderContacts } from "@/lib/recommendation-contacts";
import { recommendationSessionIsValid } from "@/lib/recommendation-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  const valid = await recommendationSessionIsValid(req);
  if (!valid) {
    return jsonResponse(
      { ok: false, reason: "Session not verified." },
      401,
    );
  }
  return jsonResponse({ ok: true, contacts: getRecommenderContacts() });
}
