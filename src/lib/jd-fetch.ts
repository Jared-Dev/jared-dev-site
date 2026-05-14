import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * Server-side fetch for JD URLs pasted by recruiters.
 *
 * Safety: SSRF mitigations via private-host blocklist, response size cap,
 * fetch timeout, content-type allowlist, output length cap. The extracted
 * text is passed through the same <job_description> isolation downstream
 * so an attacker-controlled page cannot inject instructions.
 */

const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 10_000;
const FETCH_TIMEOUT_MS = 8_000;
const ALLOWED_CONTENT_TYPES = /^(text\/html|text\/plain|application\/xhtml)/i;

/**
 * Return a parsed URL if `input` is exactly a single http(s) URL, otherwise null.
 * Rejects private/loopback/link-local hosts at the string level to mitigate SSRF.
 */
export function parseJdUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) return null;
    return url;
  } catch {
    return null;
  }
}

export interface FetchResult {
  ok: true;
  text: string;
  sourceUrl: string;
}

export interface FetchFailure {
  ok: false;
  reason: string;
}

export async function fetchJobDescription(url: URL): Promise<FetchResult | FetchFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "JaredFitBot/1.0 (+https://jareddev.com)",
        Accept: "text/html, text/plain, application/xhtml+xml;q=0.9, */*;q=0.5",
      },
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "Fetch timed out. That site is slow or blocking us." };
    }
    return { ok: false, reason: "Couldn't reach that URL." };
  }
  clearTimeout(timer);

  if (!res.ok) {
    return { ok: false, reason: `That URL returned HTTP ${res.status}.` };
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!ALLOWED_CONTENT_TYPES.test(contentType)) {
    return { ok: false, reason: `Unsupported content type (${contentType || "unknown"}).` };
  }

  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: "Empty response body." };

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return { ok: false, reason: "That page is too large to read." };
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const text = extractText(html).slice(0, MAX_OUTPUT_CHARS);
  if (text.length < 80) {
    return {
      ok: false,
      reason:
        "Couldn't extract meaningful text from that page. It may need JavaScript to render. Paste the JD directly instead.",
    };
  }
  return { ok: true, text, sourceUrl: url.href };
}

/**
 * Strip page chrome and extract the actual JD body. Two heuristics
 * applied before falling back to a generic tag strip:
 *
 *  1. If the page has a `<main>` element, work only inside it. Most
 *     job-board pages put the actual posting in `<main>`; everything
 *     outside is site navigation, search bars, and footer.
 *  2. Strip whole chrome elements (content and all): nav, header,
 *     footer, aside, button, form, svg. Then also strip any element
 *     whose class name hints at chrome (nav, menu, footer, header,
 *     sidebar, breadcrumb, cookie, banner, search, skip-link, social).
 *
 * The goal is signal density: get the bot to the JD prose within the
 * first few hundred characters of input so Claude's attention lands
 * on the role description, not the page furniture.
 */
const CHROME_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "button",
  "form",
  "svg",
] as const;

const CHROME_CLASS_HINTS = [
  "nav",
  "menu",
  "footer",
  "header",
  "sidebar",
  "breadcrumb",
  "cookie",
  "banner",
  "search",
  "skip-link",
  "social",
];

const CHROME_CLASS_RE = new RegExp(
  `<([a-z]+)\\b[^>]*class\\s*=\\s*["'][^"']*(${CHROME_CLASS_HINTS.join("|")})[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
  "gi",
);

/**
 * Try @mozilla/readability first. It's the algorithm Firefox's Reader View
 * uses, well-tested on article-shaped content. For most job-board pages
 * (Greenhouse, Lever, Workday, custom ATS) it strips chrome to just the
 * posting body with much higher fidelity than regex heuristics.
 *
 * Returns null on any failure or suspiciously-short result; the caller
 * falls back to the regex extractor in those cases.
 */
function readabilityExtract(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    // linkedom's Document is API-compatible with the DOM Document type
    // Readability expects; the structural cast keeps TypeScript happy.
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();
    if (!article) return null;
    const text = (article.textContent ?? "").trim();
    if (text.length < 100) return null;
    return text;
  } catch {
    return null;
  }
}

function extractText(html: string): string {
  // Prefer Readability; fall back to regex-based extraction if it fails
  // or produces something suspiciously short.
  const readable = readabilityExtract(html);
  if (readable) return readable;

  let s = html;
  // 1) Prefer content inside <main> if present.
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch?.[1]) s = mainMatch[1];

  // 2) Drop whole chrome elements (content included).
  for (const tag of CHROME_ELEMENTS) {
    const re = new RegExp(
      `<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`,
      "gi",
    );
    s = s.replace(re, " ");
  }
  // 3) Drop chrome-classed containers. Two passes catches nesting.
  s = s.replace(CHROME_CLASS_RE, " ");
  s = s.replace(CHROME_CLASS_RE, " ");

  // 4) Block elements become newlines so paragraphs survive.
  s = s.replace(
    /<\/?(p|div|br|h[1-6]|li|ul|ol|tr|td|th|section|article|main)[^>]*>/gi,
    "\n",
  );
  // 5) Strip remaining tags and decode common entities.
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
