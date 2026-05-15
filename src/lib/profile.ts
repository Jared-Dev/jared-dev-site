/**
 * Build-safe profile constants.
 *
 * These are sync, dependency-free, and safe to import from prerendered
 * pages (homepage, layout, etc). The actual brief content is loaded
 * separately from Redis (with disk fallback) by `@/lib/brief`, which
 * must only be imported from serverless routes.
 *
 * Recommendation letters live in `@/lib/recommendations` as a typed
 * data file. RECOMMENDATION_READY here is the feature flag the
 * homepage uses to decide whether to surface the /recommendation
 * link in nav and footer.
 */

export const PROFILE_READY = true;

export const RECOMMENDATION_READY = true;
