import { timingSafeEqual } from "node:crypto";

/**
 * Vercel recommends a CRON_SECRET of at least 16 characters. Anything
 * shorter (or unset) means the endpoint refuses every request rather
 * than running unauthenticated.
 */
const MIN_SECRET_LENGTH = 16;

/**
 * Verify a Vercel Cron invocation. Vercel sends the project's
 * CRON_SECRET as `Authorization: Bearer <secret>`. Compared in constant
 * time so response timing can't be used to guess the secret.
 */
export function isAuthorizedCronRequest(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
