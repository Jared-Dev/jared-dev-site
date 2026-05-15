/**
 * Short-lived signed-cookie session for /recommendation/contacts.
 *
 * After a recruiter clears Turnstile via /api/recommendation/verify,
 * we mint a sessionId and write it to Redis with a 30-minute rolling
 * TTL, plus drop a cookie on the response. Subsequent calls to
 * /api/recommendation/contacts read the cookie and confirm the
 * sessionId is still in Redis before returning the phone numbers.
 *
 * This is the same pattern the main Fit Tool uses for its session
 * verification, but scoped to the recommendation page so it doesn't
 * collide with the FitTool's sessionId.
 */

import { redis } from "@/lib/redis";

const COOKIE_NAME = "jared_rec_session";
const TTL_SECONDS = 30 * 60;

function redisKey(sessionId: string): string {
  return `rec_session:${sessionId}:verified`;
}

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function mintRecommendationSession(): Promise<{
  sessionId: string;
  setCookieHeader: string;
}> {
  const sessionId = randomSessionId();
  await redis().set(redisKey(sessionId), 1, { ex: TTL_SECONDS });
  const cookieParts = [
    `${COOKIE_NAME}=${sessionId}`,
    `Max-Age=${TTL_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") {
    cookieParts.push("Secure");
  }
  return { sessionId, setCookieHeader: cookieParts.join("; ") };
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, decodeURIComponent(value));
  }
  return out;
}

export async function recommendationSessionIsValid(
  req: Request,
): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const sessionId = cookies.get(COOKIE_NAME);
  if (!sessionId) return false;
  // Bump the TTL on each valid read so an active conversation never
  // gets kicked back to re-verification.
  const exists = await redis().exists(redisKey(sessionId));
  if (!exists) return false;
  await redis().expire(redisKey(sessionId), TTL_SECONDS);
  return true;
}
