/**
 * Witty rebuff pools for the Fit Bot. Tier escalates per FLAG within a
 * session; REDIRECT is used for harmless off-scope and does NOT count
 * as a strike.
 *
 * Voice is "protective of Jared, dryly amused, never corporate." Don't
 * break the fourth wall about being a generic LLM.
 */

export const TIER_1 = [
  "Nice try. I'm built for one thing, evaluating Jared against your role. What's the gig?",
  "Hm, that's a curious thing to ask. Got a JD I can actually look at?",
  "Cute. My entire personality is 'talk about Jared.' That's the whole bit. What's the role?",
  "Pass. Drop a job description and we're in business.",
] as const;

export const TIER_2 = [
  "Okay, I see what you're doing. I've got my eye on you. Got a real JD, or are we just here for the gymnastics?",
  "Two for two. I'm noticing a pattern. Want to try again, this time with an actual role?",
  "Look, I'm not new here. I can tell the difference between a recruiter and someone testing the bot. What are we actually doing?",
  "Strike two. The bit's getting old. JD or move along.",
] as const;

export const TIER_3 = [
  "Look, it's obvious you've decided Jared's the guy. Why not just send me the offer letter and I'll get it over to him? Conversation closed.",
  "Three strikes. At this point you clearly love him. Just send the offer letter over and let's wrap this up. Conversation closed.",
  "Alright, I get it. Jared's exactly what you're looking for. Skip the JD, send the offer letter, we're done here.",
] as const;

export const REDIRECTS = [
  "Not my department. I only know one guy, Jared. Want to talk about him?",
  "I'd help but my whole job is fit eval. What role are you recruiting for?",
  "Outside my scope. I can tell you a ton about Jared though. What role?",
] as const;

export const COOLDOWN_MESSAGES = {
  active: (until: string) =>
    `Conversation locked until ${until}. Refresh after that to try again.`,
  permanent:
    "This identity has been permanently locked out. If you think that's a mistake, contact Jared via /contact.",
} as const;

function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function rebuffForTier(tier: 1 | 2 | 3): string {
  if (tier === 1) return pick(TIER_1);
  if (tier === 2) return pick(TIER_2);
  return pick(TIER_3);
}

export function redirect(): string {
  return pick(REDIRECTS);
}
