import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => dbMock() }));

const { guardDb, guardDbAfter, resetDbBreaker } = await import("./guard");

beforeEach(() => {
  resetDbBreaker();
  dbMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guardDb", () => {
  it("returns the query result when the database works", async () => {
    dbMock.mockResolvedValue({});
    await expect(guardDb("ok", "fallback", async () => "value")).resolves.toBe(
      "value",
    );
  });

  it("returns the fallback when the database is unreachable", async () => {
    dbMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(guardDb("down", "fallback", async () => "value")).resolves.toBe(
      "fallback",
    );
  });

  it("returns the fallback when a query throws", async () => {
    dbMock.mockResolvedValue({});
    await expect(
      guardDb("boom", 0, async () => {
        throw new Error("syntax error");
      }),
    ).resolves.toBe(0);
  });

  it("skips the database entirely while the breaker is open", async () => {
    dbMock.mockRejectedValue(new Error("down"));
    await guardDb("first", null, async () => "x");
    expect(dbMock).toHaveBeenCalledTimes(1);
    dbMock.mockResolvedValue({});
    await expect(guardDb("second", "fallback", async () => "x")).resolves.toBe(
      "fallback",
    );
    expect(dbMock).toHaveBeenCalledTimes(1);
  });

  it("times out a hung database", async () => {
    vi.useFakeTimers();
    dbMock.mockReturnValue(new Promise(() => {}));
    const pending = guardDb("hang", "fallback", async () => "x");
    await vi.advanceTimersByTimeAsync(3_001);
    await expect(pending).resolves.toBe("fallback");
    vi.useRealTimers();
  });
});

describe("guardDbAfter", () => {
  it("never rejects and skips the write when `ready` fails", async () => {
    dbMock.mockResolvedValue({});
    const write = vi.fn(async () => {});
    await expect(
      guardDbAfter("w", write, Promise.reject(new Error("stream died"))),
    ).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });

  it("swallows a failed write", async () => {
    dbMock.mockRejectedValue(new Error("down"));
    await expect(
      guardDbAfter("w", async () => {}),
    ).resolves.toBeUndefined();
  });
});
