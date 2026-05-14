/**
 * Build-safe profile constants.
 *
 * These are sync, dependency-free, and safe to import from prerendered
 * pages (homepage, layout, etc). The actual brief content is loaded
 * separately from Redis (with disk fallback) by `@/lib/brief`, which
 * must only be imported from serverless routes.
 */

export const PROFILE_READY = true;

export const RECOMMENDATION_READY = true;

export const RECOMMENDATION = {
  recommenderName: "Mallerie Shirley",
  recommenderTitle: "Practice Operations Manager, Tensure Consulting",
  pdfPath: "/recommendation.pdf",
  blurb:
    "Letter from Mallerie Shirley, my direct manager at Tensure Consulting during the Mailchimp engagement. Speaks to full-stack range alongside the frontend specialty, AI-driven development applied with rigor and judgment, and mentorship leadership on the internal Genesis project supporting interns and junior engineers.",
} as const;
