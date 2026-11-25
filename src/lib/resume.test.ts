import { describe, expect, it } from "vitest";
import { buildSessionCookie, parseCookieHeader } from "./cookies";
import { looksLikePdf } from "./private-files";
import { RESUME_DOWNLOAD_PATH, RESUME_PATH, isResumeHref } from "./resume";

describe("isResumeHref", () => {
  it("matches the gated endpoint with or without a query", () => {
    expect(isResumeHref(RESUME_PATH)).toBe(true);
    expect(isResumeHref(RESUME_DOWNLOAD_PATH)).toBe(true);
  });

  it("does not match other paths", () => {
    expect(isResumeHref(undefined)).toBe(false);
    expect(isResumeHref("/contact")).toBe(false);
    expect(isResumeHref("/api/resumes")).toBe(false);
    expect(isResumeHref("/resume.pdf")).toBe(false);
  });
});

describe("looksLikePdf", () => {
  it("accepts bytes starting with the PDF magic", () => {
    expect(looksLikePdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(looksLikePdf(Buffer.from(""))).toBe(false);
    expect(looksLikePdf(Buffer.from("<!DOCTYPE html>"))).toBe(false);
  });
});

describe("parseCookieHeader", () => {
  it("reads named cookies and tolerates bad encoding", () => {
    const jar = parseCookieHeader("a=1; jared_verified=abc; bad=%E0");
    expect(jar.get("a")).toBe("1");
    expect(jar.get("jared_verified")).toBe("abc");
    expect(jar.get("bad")).toBe("%E0");
  });

  it("returns an empty map for a missing header", () => {
    expect(parseCookieHeader(null).size).toBe(0);
  });
});

describe("buildSessionCookie", () => {
  it("is HttpOnly, Lax, root-scoped, with the given max age", () => {
    const cookie = buildSessionCookie("n", "v", 60);
    expect(cookie).toContain("n=v");
    expect(cookie).toContain("Max-Age=60");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });
});
