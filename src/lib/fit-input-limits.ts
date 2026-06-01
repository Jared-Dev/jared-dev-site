/**
 * Shared character cap for the Fit Tool's pasted/typed user input.
 *
 * Enforced in two places that must never drift, so the value lives here:
 *  - the client ([FitTool]) checks before submit so an over-limit paste
 *    fails fast with a specific message and the text is never lost;
 *  - the server (/api/fit) is the authoritative gate.
 *
 * Real job descriptions, especially the long-form "manifesto" postings,
 * routinely run 15k-20k characters, so the cap is deliberately generous.
 * It still bounds a single eval's token cost and the abuse payload size.
 */
export const MAX_USER_INPUT_CHARS = 50_000;

export interface UserInputLengthCheck {
  ok: boolean;
  length: number;
  max: number;
  /** Present only when ok is false: a recruiter-facing explanation. */
  message?: string;
}

export function checkUserInputLength(input: string): UserInputLengthCheck {
  const length = input.length;
  if (length <= MAX_USER_INPUT_CHARS) {
    return { ok: true, length, max: MAX_USER_INPUT_CHARS };
  }
  return {
    ok: false,
    length,
    max: MAX_USER_INPUT_CHARS,
    message: `That job description is ${length.toLocaleString()} characters; I can take up to ${MAX_USER_INPUT_CHARS.toLocaleString()}. Trim it to the parts that matter most and send again.`,
  };
}
