/**
 * The Fit Tool's "thinking" trace: a short, honest log of what the
 * server actually did with a message (fetched a page, asked Jev,
 * handed off to Claude) shown above the answer while it streams.
 *
 * Shared by server and client, so this module must stay free of
 * server-only imports. The server builds the trace (fit-trace-build)
 * and ships it in a response header ahead of the streamed body; the
 * client decodes it here. Steps are generated from our own enums and
 * copy, never from model output, and the client renders them as text.
 *
 * Security screening is deliberately absent from the trace. Saying
 * when the screen did or didn't run would hand attackers a map.
 */

export const FIT_TRACE_HEADER = "X-Fit-Trace";

export enum TraceSource {
  Web = "web",
  Jev = "jev",
  Claude = "claude",
  Cache = "cache",
}

export interface TraceStep {
  source: TraceSource;
  text: string;
}

export interface FitTrace {
  /** Work already finished by the time the response started. */
  steps: TraceStep[];
  /** What the server is waiting on while the body streams, if anything. */
  pending: TraceStep | null;
}

const SOURCES = new Set<string>(Object.values(TraceSource));
const MAX_STEPS = 8;
const MAX_TEXT = 240;

function isStep(value: unknown): value is TraceStep {
  if (!value || typeof value !== "object") return false;
  const step = value as Record<string, unknown>;
  return (
    typeof step.source === "string" &&
    SOURCES.has(step.source) &&
    typeof step.text === "string" &&
    step.text.length > 0 &&
    step.text.length <= MAX_TEXT
  );
}

/** UTF-8 safe base64, so step copy can carry an ellipsis or a hostname. */
export function encodeFitTrace(trace: FitTrace): string {
  const bytes = new TextEncoder().encode(JSON.stringify(trace));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Returns null for anything that isn't a well-formed trace. */
export function decodeFitTrace(encoded: string | null): FitTrace | null {
  if (!encoded) return null;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { steps, pending } = parsed as Record<string, unknown>;
    if (!Array.isArray(steps) || steps.length > MAX_STEPS) return null;
    if (!steps.every(isStep)) return null;
    if (pending !== null && !isStep(pending)) return null;
    return { steps, pending };
  } catch {
    return null;
  }
}
