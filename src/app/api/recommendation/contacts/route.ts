/**
 * Returns recommender contact info (phone numbers, call-welcome text)
 * for the /recommendation page. Gated by the verified-visitor cookie set
 * by /api/recommendation/verify (or any other Turnstile gate on the
 * site): no valid cookie, no contacts.
 */

import { getRecommenderContacts } from "@/lib/recommendation-contacts";
import { isVerifiedVisitor } from "@/lib/verified-visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  if (!isVerifiedVisitor(req)) {
    return jsonResponse(
      { ok: false, reason: "Session not verified." },
      401,
    );
  }
  return jsonResponse({ ok: true, contacts: getRecommenderContacts() });
}
