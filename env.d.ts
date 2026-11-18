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
    // Postgres. Optional in the type because every runtime query fails
    // open (src/lib/db/guard.ts); production builds refuse to run without
    // it (scripts/migrate-deploy.mjs). Local `pnpm dev` ignores it and
    // uses embedded PGlite unless DEV_REMOTE_DB=1.
    DATABASE_URL?: string;
    DEV_REMOTE_DB?: string;
    MIGRATE_ON_BUILD?: string;
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
    // Authorizes PUT /api/private-files/* (brief + resume uploads). Same
    // value in Vercel and .env.local. Optional in the type because the
    // endpoint refuses every request while it's unset or short.
    PRIVATE_UPLOAD_SECRET?: string;
    // Optional: where `pnpm run private:upload` sends files (default
    // https://jareddev.com).
    PRIVATE_UPLOAD_URL?: string;

    // Public — Next.js inlines into the client bundle at build time.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
    NEXT_PUBLIC_CALENDAR_URL?: string;
  }
}
