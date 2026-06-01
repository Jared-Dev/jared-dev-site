import { describe, expect, it } from "vitest";
import {
  MAX_USER_INPUT_CHARS,
  checkUserInputLength,
} from "./fit-input-limits";

describe("checkUserInputLength", () => {
  it("accepts input at exactly the limit", () => {
    const result = checkUserInputLength("x".repeat(MAX_USER_INPUT_CHARS));
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it("accepts a realistic long job description (well under the cap)", () => {
    // The 19k-character ManageBee posting that originally failed against the
    // old 10k cap must now pass.
    const result = checkUserInputLength("x".repeat(19_129));
    expect(result.ok).toBe(true);
  });

  it("rejects input one character over the limit", () => {
    const result = checkUserInputLength("x".repeat(MAX_USER_INPUT_CHARS + 1));
    expect(result.ok).toBe(false);
    expect(result.length).toBe(MAX_USER_INPUT_CHARS + 1);
    expect(result.max).toBe(MAX_USER_INPUT_CHARS);
  });

  it("includes both the actual length and the cap in the message", () => {
    const result = checkUserInputLength("x".repeat(60_000));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("60,000");
    expect(result.message).toContain(MAX_USER_INPUT_CHARS.toLocaleString());
  });

  it("accepts empty input here (min-length is enforced separately)", () => {
    expect(checkUserInputLength("").ok).toBe(true);
  });
});
