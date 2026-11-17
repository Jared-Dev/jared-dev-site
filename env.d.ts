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
    // Redis credentials come in one of two pairs (see resolveRedisConfig in
    // src/lib/redis.ts). Marketplace-connected stores inject KV_*; hand-
    // entered credentials use UPSTASH_*. Either pair may be absent.
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    TURNSTILE_SECRET_KEY: string;
    IP_HASH_SALT: string;
    CONTACT_EMAIL: string;
    CONTACT_PHONE: string;
    // Optional on purpose: when unset, getRecommenderContacts drops the
    // entry rather than shipping an undefined phone the UI would crash on.
    // Keep these honest so callers are forced to handle the missing case.
    MALLERIE_PHONE?: string;
    DAVID_PHONE?: string;
    // Optional: TypeSafe Jev key. When unset or blank, the Fit Tool skips
    // the Jev intake read and runs the pre-Jev classifier flow unchanged.
    TYPESAFE_API_KEY?: string;
    // Vercel sends this as `Authorization: Bearer <secret>` on cron runs.
    // Optional in the type because the keep-alive route fails closed
    // (401 on every request) when it's unset or under 16 characters.
    CRON_SECRET?: string;

    // Public — Next.js inlines into the client bundle at build time.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
    NEXT_PUBLIC_CALENDAR_URL?: string;
  }
}
