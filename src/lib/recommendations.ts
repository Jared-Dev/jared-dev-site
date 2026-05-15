/**
 * Recommendation letters: structured data + flavor-aware quote selection.
 *
 * Each letter carries a curated pool of quotes pulled verbatim from the
 * PDF. Quotes are tagged with the role flavors they suit and short
 * topic labels so the recommendation page can surface the most
 * relevant 1-2 quotes per letter for a recruiter whose conversation
 * has produced a flavor signal.
 *
 * Authoring conventions for new letters:
 *
 *  - Aim for 5-6 quotes per letter. Each quote must be verbatim from
 *    the PDF (no paraphrasing). One-sentence quotes are ideal;
 *    two-sentence quotes are the cap.
 *  - Each quote gets `flavors` (subset of leadership/ic/mixed) and
 *    `topics` (short labels like mentorship, ai-tooling, delivery).
 *  - Exactly one quote per letter is `primary: true`. That quote is
 *    surfaced when the recruiter arrives with no flavor signal.
 *  - The renderer picks up to 2 quotes per letter at display time.
 *
 * !! PRIVACY CHECKLIST FOR EACH NEW LETTER PDF !!
 * Before committing a letter PDF to public/, redact the recommender's
 * personal phone number and personal email if present. The PDF is
 * served as a static file; the Turnstile gate on the recommendation
 * page only hides the download button, it does not prevent direct URL
 * access. Phone numbers especially must be removed at the PDF level.
 *
 *  - Mallerie's PDF: contains 763-226-5887 — REDACT
 *  - David's PDF: contains 719.964.0002 — REDACT
 */

import { RoleFlavor } from "@/components/FitTool";

export enum QuoteTopic {
  GeneralStrength = "general-strength",
  Mentorship = "mentorship",
  Leadership = "leadership",
  Communication = "communication",
  Judgment = "judgment",
  AiTooling = "ai-tooling",
  Delivery = "delivery",
  Ownership = "ownership",
  Versatility = "versatility",
  LeadershipEndorsement = "leadership-endorsement",
}

export interface Quote {
  id: string;
  text: string;
  flavors: readonly RoleFlavor[];
  topics: readonly QuoteTopic[];
  primary?: boolean;
}

export interface Letter {
  id: string;
  recommenderName: string;
  recommenderTitle: string;
  recommenderCompany: string;
  /** One-line context describing the working relationship. */
  relationship: string;
  /** Public path the file lives at after redaction. */
  pdfPath: string;
  /** Optional public path to a square headshot. Falls back to an
   *  initial-based disc when absent so the layout stays stable. */
  photoPath?: string;
  /** YYYY-MM for sort order. */
  dateReceived: string;
  quotes: readonly Quote[];
}

export const LETTERS: readonly Letter[] = [
  {
    id: "mallerie",
    recommenderName: "Mallerie Shirley",
    recommenderTitle: "Practice Operations Manager",
    recommenderCompany: "Tensure Consulting",
    relationship: "Direct manager at Tensure Consulting",
    pdfPath: "/Mallerie-RecommendationLetter.pdf",
    photoPath: "/MallerieHeadshot.jpg",
    dateReceived: "2026-04",
    quotes: [
      {
        id: "well-rounded-engineer",
        text: "Among the most well-rounded engineers I have had the pleasure of working with.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.GeneralStrength],
        primary: true,
      },
      {
        id: "grew-into-leadership",
        text: "He organically grew into a leadership role leading code reviews, setting technical strategy, and elevating the quality of work produced by the interns and junior engineers on the team.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Mixed],
        topics: [QuoteTopic.Mentorship, QuoteTopic.Leadership],
      },
      {
        id: "engineer-and-mentor",
        text: "It is rare to find an engineer of his caliber who is equally gifted as a mentor.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Mixed],
        topics: [QuoteTopic.Mentorship],
      },
      {
        id: "ai-thoughtful-integration",
        text: "He does not simply adopt tools, he integrates them thoughtfully into his workflow to improve product quality and delivery outcomes.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.AiTooling, QuoteTopic.Judgment],
      },
      {
        id: "calm-communication",
        text: "His calm, clear communication style distinguishes him from his peers and reflects a depth of understanding that goes well beyond writing code.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.Communication],
      },
      {
        id: "quality-precision",
        text: "He is detail-oriented and self-motivated, approaching every task with a focus on quality and precision.",
        flavors: [RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.Ownership, QuoteTopic.Delivery],
      },
    ],
  },
  {
    id: "david",
    recommenderName: "David McGee",
    recommenderTitle: "Director of Project Management and Delivery",
    recommenderCompany: "Tensure Consulting",
    relationship: "Project delivery lead at Tensure Consulting",
    pdfPath: "/David-RecommendationLetter.pdf",
    photoPath: "/David-Headshot.png",
    dateReceived: "2026-04",
    quotes: [
      {
        id: "every-team-hopes-to-have",
        text: "Jared is the type of engineer every project team hopes to have.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.GeneralStrength],
        primary: true,
      },
      {
        id: "fantastic-at-both",
        text: "I have witnessed him deliver both as an individual contributor and as a leader and he is fantastic at both!",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.Versatility, QuoteTopic.GeneralStrength],
      },
      {
        id: "ownership-mentorship-trust",
        text: "He consistently took ownership of complex workstreams, helped mentor junior engineers and interns, and was someone the team trusted to work through difficult technical challenges collaboratively.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Mixed],
        topics: [QuoteTopic.Ownership, QuoteTopic.Mentorship],
      },
      {
        id: "steady-fast-paced",
        text: "He brings strong technical skills, good judgment, and a steady approach that helps keep projects moving forward, especially in fast-paced environments.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.Delivery, QuoteTopic.Judgment],
      },
      {
        id: "calm-under-pressure",
        text: "He communicates clearly, stays calm under pressure, and is always willing to help teammates think through problems or unblock issues.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Ic, RoleFlavor.Mixed],
        topics: [QuoteTopic.Communication],
      },
      {
        id: "senior-or-leadership",
        text: "I would strongly recommend him for any senior engineering or technology leadership opportunity.",
        flavors: [RoleFlavor.Leadership, RoleFlavor.Mixed],
        topics: [QuoteTopic.LeadershipEndorsement],
      },
    ],
  },
];

// Three quotes per card: one hero quote at full visual weight and two
// supporting quotes underneath in lighter type. Past three the eye
// stops reading and the page starts to feel like filler.
const MAX_QUOTES_PER_LETTER = 3;

/**
 * Score a quote against the current flavor. Higher = better match.
 *
 *  - 0 if the quote doesn't carry the current flavor at all (filtered out)
 *  - 3 if the quote ONLY carries the current flavor (most specific signal)
 *  - 2 if the quote carries the current flavor plus one other
 *  - 1 if the quote carries all three flavors (universal, lowest specificity)
 */
function flavorScore(quote: Quote, flavor: RoleFlavor): number {
  if (!quote.flavors.includes(flavor)) return 0;
  return 4 - quote.flavors.length;
}

/**
 * Pick up to MAX_QUOTES_PER_LETTER quotes for a letter, ordered by
 * specificity-of-flavor-match. When no flavor is known (recruiter
 * landed without a Fit Tool session), return just the primary quote.
 *
 * Stable: when two quotes have the same flavor score, preserves the
 * order they appear in the data file. Lets authors influence ordering
 * with intent.
 */
// Mix count matches the flavor-known cap so the card height is
// consistent across visit states. A recruiter without a flavor signal
// still sees a hero + two supporting quotes; the difference is just
// which two land in the supporting slots.
const MIX_QUOTE_COUNT = 3;

function isUniversalQuote(quote: Quote): boolean {
  return quote.flavors.length === 3;
}

function leansToward(quote: Quote, flavor: RoleFlavor): boolean {
  return quote.flavors.includes(flavor) && !isUniversalQuote(quote);
}

/**
 * When no flavor signal exists, pick a deliberately mixed cross-section:
 *   1. Primary quote (universal anchor for the card)
 *   2. One quote that leans toward leadership specifically
 *   3. One quote that leans toward IC specifically
 *   4. Fill remaining slots with whatever's left, in source order
 *
 * This produces variety: a recruiter who hasn't told us what they're
 * hiring for sees evidence that touches both leadership and IC framings,
 * rather than a stack of universal "well-rounded engineer" quotes that
 * all read the same way.
 */
function selectMix(quotes: readonly Quote[]): readonly Quote[] {
  const picked: Quote[] = [];
  const usedIds = new Set<string>();
  const take = (q: Quote | undefined): void => {
    if (!q || usedIds.has(q.id) || picked.length >= MIX_QUOTE_COUNT) return;
    picked.push(q);
    usedIds.add(q.id);
  };

  take(quotes.find((q) => q.primary));
  take(quotes.find((q) => leansToward(q, RoleFlavor.Leadership)));
  take(quotes.find((q) => leansToward(q, RoleFlavor.Ic)));
  for (const q of quotes) take(q);
  return picked;
}

export function selectQuotesForLetter(
  letter: Letter,
  flavor: RoleFlavor | null,
): readonly Quote[] {
  if (flavor === null || flavor === RoleFlavor.Unknown) {
    return selectMix(letter.quotes);
  }

  // Flavor known: prefer quotes that match it, ranked by specificity
  // (a leadership-only quote outranks a universal one when the
  // conversation signaled leadership). Quotes that don't fit the
  // flavor at all are dropped.
  const scored = letter.quotes
    .map((quote, index) => ({
      quote,
      index,
      score: flavorScore(quote, flavor),
    }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.index - b.index;
  });

  const picked = scored.slice(0, MAX_QUOTES_PER_LETTER).map((e) => e.quote);
  if (picked.length === 0) {
    // Shouldn't happen with the current data (every letter has at
    // least one universal quote), but degrade gracefully if a future
    // letter has tighter tagging.
    return selectMix(letter.quotes);
  }
  return picked;
}

/** Letters sorted newest-first by `dateReceived`. */
export function lettersByRecency(): readonly Letter[] {
  return [...LETTERS].sort((a, b) =>
    b.dateReceived.localeCompare(a.dateReceived),
  );
}
