import { afterEach, describe, expect, it, vi } from "vitest";
import { askJev, isJevEnabled, JEV_MAX_STATE_CHARS, JevQuestionType } from "./jev";

const QUESTIONS = {
  q: { type: JevQuestionType.Noul, instructions: "Is this a job?" },
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("askJev", () => {
  it("is disabled and never calls the network without a key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(isJevEnabled()).toBe(false);
    expect(await askJev("hello", QUESTIONS)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "ts-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("overloaded", { status: 529 })),
    );
    expect(await askJev("hello", QUESTIONS)).toBeNull();
  });

  it("returns null when the request throws (timeout, network)", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "ts-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );
    expect(await askJev("hello", QUESTIONS)).toBeNull();
  });

  it("returns null on a malformed body", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "ts-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ nope: true })),
    );
    expect(await askJev("hello", QUESTIONS)).toBeNull();
  });

  it("returns answers and truncates oversized state", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "ts-test");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ answers: { q: { type: "noul", noul: 0.9 } } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const answers = await askJev("x".repeat(JEV_MAX_STATE_CHARS + 500), QUESTIONS);
    expect(answers).toEqual({ q: { type: "noul", noul: 0.9 } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { state: string };
    expect(body.state).toHaveLength(JEV_MAX_STATE_CHARS);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ts-test",
    );
  });
});
