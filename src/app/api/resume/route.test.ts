import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end gate check for the resume: no Turnstile, no PDF. Drives
 * the real /api/contact-reveal and /api/resume handlers, so the cookie a
 * passed gate mints is the one the resume route accepts. The gate itself
 * needs no database; only the PDF bytes come from it (mocked here).
 */

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(async (token: string) => token === "good"),
}));

const FAKE_PDF = Buffer.from("%PDF-1.7\nfake resume body");
const loadPrivateFile = vi.fn(async () => FAKE_PDF);
vi.mock("@/lib/private-files", async (orig) => ({
  ...(await orig<typeof import("@/lib/private-files")>()),
  loadPrivateFile: () => loadPrivateFile(),
}));

const { GET: getResume } = await import("./route");
const { POST: revealContact } = await import("../contact-reveal/route");

const BASE = "https://jareddev.com";

function reveal(token: string, cookie?: string): Promise<Response> {
  return revealContact(
    new Request(`${BASE}/api/contact-reveal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ turnstileToken: token }),
    }),
  );
}

function resume(cookie?: string, query = ""): Promise<Response> {
  return getResume(
    new Request(`${BASE}/api/resume${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

/** "name=value" from a Set-Cookie header, as a browser would send it back. */
function cookiePair(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  return header ? header.split(";")[0]! : null;
}

beforeEach(() => {
  vi.stubEnv("IP_HASH_SALT", "x".repeat(48));
  loadPrivateFile.mockImplementation(async () => FAKE_PDF);
});

describe("resume gate", () => {
  it("redirects to /contact without a cookie", async () => {
    const res = await resume();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/contact`);
  });

  it("rejects a forged or expired cookie", async () => {
    const { signToken } = await import("@/lib/verified-visitor");
    const expired = await resume(`jared_verified=${signToken(Date.now() - 1)}`);
    expect(expired.status).toBe(303);
    const forged = await resume(`jared_verified=${Date.now() + 60_000}.forged`);
    expect(forged.status).toBe(303);
  });

  it("does not mint a cookie when Turnstile fails", async () => {
    const res = await reveal("bad");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("serves the PDF after the /contact gate passes", async () => {
    const gate = await reveal("good");
    expect(gate.status).toBe(200);
    const cookie = cookiePair(gate);
    expect(cookie).toMatch(/^jared_verified=/);

    const inline = await resume(cookie!);
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-type")).toBe("application/pdf");
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(inline.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await inline.arrayBuffer())).toEqual(FAKE_PDF);

    const download = await resume(cookie!, "?download=1");
    expect(download.headers.get("content-disposition")).toMatch(
      /^attachment;/,
    );
  });

  it("passes a gated request on the cookie alone and re-issues it", async () => {
    const cookie = cookiePair(await reveal("good"));
    const again = await reveal("spent-token", cookie!);
    expect(again.status).toBe(200);
    expect(cookiePair(again)).toMatch(/^jared_verified=/);
  });

  it("returns 503 when the resume can't be loaded", async () => {
    const cookie = cookiePair(await reveal("good"));
    loadPrivateFile.mockImplementation(async () => {
      throw new Error("database unreachable");
    });
    const res = await resume(cookie!);
    expect(res.status).toBe(503);
  });
});
