/**
 * Server-side text extraction from JD files uploaded by recruiters.
 *
 * Accepts PDF (.pdf) and DOCX (.docx). Returns plain text up to a
 * length cap. Used by the /api/fit/extract-file endpoint so the
 * client can populate the Fit Tool textarea with the contents of a
 * dropped or attached file.
 *
 * Safety:
 *  - Size cap enforced by the caller before this is invoked
 *  - Mime type allowlist + magic-byte validation (libraries do this
 *    too but we do an explicit check first as defense in depth)
 *  - Output length cap so an oversized JD can't blow up downstream
 *  - Extracted text is treated as untrusted user input and isolated
 *    inside <job_description> tags by the eval flow downstream
 *
 * Library choices:
 *  - unpdf for PDF: ESM, serverless-friendly, no native binaries.
 *    Built on a vendored pdf.js. Works on Vercel out of the box.
 *  - mammoth for DOCX: well-maintained, returns raw text without
 *    the ZIP-XML mess of the docx format.
 */

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export enum SupportedJdMime {
  Pdf = "application/pdf",
  Docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

const SUPPORTED_MIMES = new Set<string>(Object.values(SupportedJdMime));

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — DOCX is a ZIP container

const MAX_OUTPUT_CHARS = 10_000;

export interface JdExtractSuccess {
  ok: true;
  text: string;
  filename: string;
  mime: SupportedJdMime;
}

export interface JdExtractFailure {
  ok: false;
  reason: string;
}

export type JdExtractResult = JdExtractSuccess | JdExtractFailure;

function bytesStartWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function classifyByMagic(bytes: Uint8Array): SupportedJdMime | null {
  if (bytesStartWith(bytes, PDF_MAGIC)) return SupportedJdMime.Pdf;
  if (bytesStartWith(bytes, ZIP_MAGIC)) return SupportedJdMime.Docx;
  return null;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  // unpdf returns either a string or string[] depending on mergePages; with
  // mergePages: true the type is string but TS sees the union from the lib.
  return Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  // mammoth wants a node Buffer or { buffer: ArrayBuffer }; we hand it the
  // ArrayBuffer slice that backs our Uint8Array.
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractJdFromFile(
  filename: string,
  declaredMime: string,
  bytes: Uint8Array,
): Promise<JdExtractResult> {
  if (!SUPPORTED_MIMES.has(declaredMime)) {
    return {
      ok: false,
      reason: `Unsupported file type "${declaredMime}". Upload a PDF or DOCX.`,
    };
  }

  const actualMime = classifyByMagic(bytes);
  if (!actualMime) {
    return {
      ok: false,
      reason: "File doesn't look like a valid PDF or DOCX.",
    };
  }
  if (actualMime !== declaredMime) {
    return {
      ok: false,
      reason: `File contents (${actualMime}) don't match the declared type (${declaredMime}).`,
    };
  }

  let raw: string;
  try {
    raw =
      actualMime === SupportedJdMime.Pdf
        ? await extractPdf(bytes)
        : await extractDocx(bytes);
  } catch (err) {
    return {
      ok: false,
      reason: `Couldn't read the file: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const normalized = normalizeWhitespace(raw);
  if (normalized.length < 80) {
    return {
      ok: false,
      reason:
        "Couldn't extract meaningful text from that file. It may be scanned or image-only. Paste the JD directly instead.",
    };
  }

  return {
    ok: true,
    text: normalized.slice(0, MAX_OUTPUT_CHARS),
    filename,
    mime: actualMime,
  };
}
