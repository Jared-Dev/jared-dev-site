import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const setMock = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
  return "OK";
});
const getMock = vi.fn(async (key: string) => store.get(key) ?? null);

vi.mock("@/lib/redis", () => ({
  redis: () => ({ set: setMock, get: getMock }),
}));

const { GET } = await import("./route");

const SECRET = "c".repeat(32);

function cronRequest(auth?: string): Request {
  return new Request("https://jareddev.com/api/cron/redis-keepalive", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  store.clear();
  setMock.mockClear();
  getMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/redis-keepalive", () => {
  it("rejects requests without the cron secret and never touches Redis", async () => {
    const res = await GET(cronRequest("Bearer nope"));
    expect(res.status).toBe(401);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("writes and reads back a timestamp with a TTL", async () => {
    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(setMock).toHaveBeenCalledWith(
      "health:redis-keepalive",
      expect.any(String),
      { ex: 7 * 24 * 60 * 60 },
    );
  });

  it("returns 503 when Redis is unreachable", async () => {
    setMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Redis unreachable" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns 503 when the read-back doesn't match", async () => {
    getMock.mockResolvedValueOnce("stale");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    errSpy.mockRestore();
  });
});
