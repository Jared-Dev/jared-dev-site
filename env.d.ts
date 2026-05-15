/**
 * Type augmentation for process.env so server code gets `string`
 * instead of `string | undefined` for the env vars this app expects.
 *
 * NEXT_PUBLIC_ prefixed vars are inlined into client bundles by Next.js
 * at build time; everything else is server-only (browser reads it as
 * undefined). The naming convention is the security boundary —
 * Next.js + Vercel enforce it automatically.
 *
 * NOTE: this is a type-level promise, not a runtime guarantee. Callers
 * that need to fail fast on a missing var should use `requireEnv` from
 * src/lib/require-env.ts.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Server-only — never inlined into the client bundle.
    ANTHROPIC_API_KEY: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    TURNSTILE_SECRET_KEY: string;
    IP_HASH_SALT: string;
    CONTACT_EMAIL: string;
    CONTACT_PHONE: string;
    MALLERIE_PHONE: string;
    DAVID_PHONE: string;

    // Public — Next.js inlines into the client bundle at build time.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
    NEXT_PUBLIC_CALENDAR_URL?: string;
  }
}
