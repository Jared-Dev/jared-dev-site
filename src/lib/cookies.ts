/** Minimal cookie helpers for the signed verified-visitor cookie. */

export function parseCookieHeader(
  cookieHeader: string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try {
      out.set(name, decodeURIComponent(value));
    } catch {
      // Malformed percent-encoding: keep the raw value rather than throw.
      out.set(name, value);
    }
  }
  return out;
}

/** HttpOnly, SameSite=Lax session cookie; Secure in production. */
export function buildSessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
