/**
 * Server-only recommender contact data. Phone numbers come from
 * environment variables (defaults in env.ts) so they are never bundled
 * into client JavaScript or any file that ships to the browser.
 *
 * Consumers must be server-side only (API routes). Any client component
 * needing this data should fetch it from /api/recommendation/contacts,
 * which gates access behind a Turnstile-verified session cookie.
 *
 * If a recommender's call-welcome attitude is unknown or the letter
 * itself doesn't make it explicit, prefer the neutral "is reachable
 * at" phrasing over implying they invite cold calls.
 */

export interface RecommenderContact {
  /** Matches Letter.id in src/lib/recommendations.ts. */
  id: string;
  /** Display-formatted phone. Click-to-call link is built from a digits-only form. */
  phone: string;
  /** "welcomes calls on her cell" — first-person verb fragment that
   *  reads naturally after the recommender's first name. */
  callsWelcomeText: string;
}

export function getRecommenderContacts(): RecommenderContact[] {
  const raw: Array<Omit<RecommenderContact, "phone"> & { phone?: string }> = [
    {
      id: "mallerie",
      phone: process.env.MALLERIE_PHONE,
      callsWelcomeText: "welcomes calls on her cell",
    },
    {
      id: "david",
      phone: process.env.DAVID_PHONE,
      callsWelcomeText: "is reachable at",
    },
  ];

  // A missing or blank phone env var must never reach the client: the UI
  // builds a tel: link from this value, and an undefined phone throws
  // mid-render. Drop any entry without a usable number so the card renders
  // without a contact line instead of taking down the page.
  return raw.flatMap((entry) => {
    const phone = entry.phone?.trim();
    if (!phone) return [];
    return [{ id: entry.id, phone, callsWelcomeText: entry.callsWelcomeText }];
  });
}
