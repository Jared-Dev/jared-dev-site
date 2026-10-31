/**
 * Minimal client for TypeSafe's Jev (System One) decision model.
 *
 * Jev answers typed questions about a piece of state (choice, score,
 * yes/no) and never generates text. We call the HTTP API directly
 * rather than pulling in the SDK: the surface we use is one POST, and
 * a plain fetch keeps the failure modes in our hands.
 *
 * Contract with callers: askJev NEVER throws. Missing key, timeout,
 * non-2xx, or a malformed body all return null, and every caller must
 * treat null as "Jev had nothing to say" and fall through to the
 * pre-Jev behavior. Jev is an optional accelerator, not a dependency.
 */

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

/**
 * Hard ceiling on a Jev round-trip. Published latency is 70 to 500ms;
 * past this we stop waiting so a slow Jev can never stall a recruiter.
 */
const JEV_TIMEOUT_MS = 1_500;

/**
 * Jev's context length isn't published. Intake questions are answerable
 * from the head of a posting, so cap the state well below any plausible
 * limit rather than opting into the long-context header.
 */
export const JEV_MAX_STATE_CHARS = 12_000;

export enum JevQuestionType {
  Choice = "choice",
  Score = "score",
  Noul = "noul",
}

export type JevQuestion =
  | { type: JevQuestionType.Choice; instructions: string; criteria: Record<string, string> }
  | { type: JevQuestionType.Score; instructions: string; criteria: string[] }
  | {
      type: JevQuestionType.Noul;
      instructions: string;
      criteria?: { true?: string; false?: string };
    };

export interface JevChoiceAnswer {
  type: JevQuestionType.Choice;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevScoreAnswer {
  type: JevQuestionType.Score;
  /** Probability-weighted level; may land between integer levels. */
  score: number;
  confidence: number;
}

export interface JevNoulAnswer {
  type: JevQuestionType.Noul;
  /** Probability the answer is yes, 0 to 1. */
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export function isJevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

export async function askJev(
  state: string,
  questions: Record<string, JevQuestion>,
): Promise<Record<string, JevAnswer> | null> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state: state.slice(0, JEV_MAX_STATE_CHARS),
        questions,
      }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[jev] HTTP ${res.status}; falling back`);
      }
      return null;
    }
    const body = (await res.json()) as { answers?: unknown };
    if (!body.answers || typeof body.answers !== "object") return null;
    return body.answers as Record<string, JevAnswer>;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[jev] ${err instanceof Error ? err.name : "error"}; falling back`,
      );
    }
    return null;
  }
}
