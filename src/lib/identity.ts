import { createHash, randomUUID } from "node:crypto";

/**
 * Produce a stable identity hash from request IP plus a UA fingerprint.
 *
 * Salted with IP_HASH_SALT so the hash cannot be reversed to a raw IP
 * even if the Redis store leaks. Raw IPs never get persisted anywhere.
 */
export function hashIdentity(ip: string, userAgent: string | null): string {
  return createHash("sha256")
    .update(process.env.IP_HASH_SALT)
    .update("|")
    .update(ip || "unknown")
    .update("|")
    .update(userAgent ?? "no-ua")
    .digest("hex");
}

/**
 * Resolve client IP from request headers (Vercel sets x-forwarded-for and
 * x-real-ip). Falls back to a sentinel rather than throwing so the rate
 * limiter can still scope on identity hash.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function newSessionId(): string {
  return randomUUID();
}
