/**
 * The site's one Turnstile gate, shared by every gated endpoint:
 * /api/fit, /api/fit/extract-file, /api/contact-reveal,
 * /api/recommendation/*, and /api/resume.
 *
 * Clearing Turnstile once mints a stateless cookie,
 * `<expiresAtMs>.<HMAC-SHA256>`. While it's valid, gated requests skip
 * the Cloudflare round trip and need no database lookup. Each pass
 * re-issues it, so an active visitor's 30-minute window keeps rolling.
 *
 * The HMAC key is HKDF-derived from IP_HASH_SALT (an existing server
 * secret) with its own label, so no extra env var is needed. Rotating
 * that salt also signs everyone out of the gate, which is harmless.
 */

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { buildSessionCookie, parseCookieHeader } from "@/lib/cookies";
import { clientIp } from "@/lib/identity";
import { verifyTurnstile } from "@/lib/turnstile";

const COOKIE_NAME = "jared_verified";
const TTL_SECONDS = 30 * 60;
const MIN_SECRET_LENGTH = 16;

let cachedKey: { secret: string; key: Buffer } | null = null;

function signingKey(): Buffer | null {
  const secret = process.env.IP_HASH_SALT;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: Buffer.from(hkdfSync("sha256", secret, "", "verified-visitor-v1", 32)),
    };
  }
  return cachedKey.key;
}

function signature(key: Buffer, expiresAtMs: number): string {
  return createHmac("sha256", key).update(String(expiresAtMs)).digest("base64url");
}

export function signToken(expiresAtMs: number): string | null {
  const key = signingKey();
  return key ? `${expiresAtMs}.${signature(key, expiresAtMs)}` : null;
}

export function verifyToken(token: string, nowMs: number): boolean {
  const key = signingKey();
  if (!key) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiresAtMs = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs) return false;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(key, expiresAtMs));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** True when the request carries an unexpired, correctly signed cookie. */
export function isVerifiedVisitor(req: Request, nowMs = Date.now()): boolean {
  const token = parseCookieHeader(req.headers.get("cookie")).get(COOKIE_NAME);
  return token ? verifyToken(token, nowMs) : false;
}

/** A fresh Set-Cookie header, or null when the signing secret is missing. */
export function verifiedVisitorCookie(nowMs = Date.now()): string | null {
  const token = signToken(nowMs + TTL_SECONDS * 1000);
  if (!token) {
    console.error("[gate] IP_HASH_SALT is missing or too short; cannot sign the gate cookie.");
    return null;
  }
  return buildSessionCookie(COOKIE_NAME, token, TTL_SECONDS);
}

export interface GateResult {
  ok: boolean;
  /** Attach to the response when ok (rolling refresh). */
  setCookie: string | null;
}

/**
 * Passes when the request already carries a valid cookie, otherwise
 * verifies the Turnstile token with Cloudflare.
 */
export async function passGate(
  req: Request,
  turnstileToken: string | undefined,
): Promise<GateResult> {
  const ok =
    isVerifiedVisitor(req) ||
    (!!turnstileToken && (await verifyTurnstile(turnstileToken, clientIp(req))));
  return { ok, setCookie: ok ? verifiedVisitorCookie() : null };
}
