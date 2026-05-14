import { serverEnv } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Cloudflare Turnstile token server-side. Returns true only on
 * success. Any error or invalid response is treated as failure.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const { TURNSTILE_SECRET_KEY } = serverEnv();
  // Dev bypass: allows local testing without setting up a real Turnstile site.
  // Configure both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to
  // "dev-bypass" in .env.local; never use these values in production.
  if (TURNSTILE_SECRET_KEY === "dev-bypass" && token === "dev-bypass") return true;
  const form = new URLSearchParams();
  form.set("secret", TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
