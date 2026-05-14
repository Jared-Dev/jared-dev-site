"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Turnstile } from "@/components/Turnstile";
import styles from "./FitTool.module.css";

export type RoleFlavor = "leadership" | "ic" | "mixed" | "unknown";

/**
 * Parse the bot's leading <flavor>X</flavor> tag (emitted on JD evals
 * only) anywhere in the first ~200 chars of the response. Tolerant of:
 *  - leading whitespace or newlines before the tag
 *  - case variation (<Flavor>, <FLAVOR>)
 *  - the tag being wrapped in stray punctuation by the model
 *
 * Returns the extracted flavor (or null if no tag was found) and the
 * remaining display content with the tag and surrounding whitespace
 * stripped.
 *
 * If `done` is false, we don't yet have enough text to decide; the
 * caller should buffer the chunk and wait for more.
 */
const FLAVOR_TAG_RE = /<flavor>\s*([a-z]+)\s*<\/flavor>/i;
const FLAVOR_SCAN_WINDOW = 200;

function maybeExtractFlavor(text: string): {
  done: boolean;
  flavor: RoleFlavor | null;
  remaining: string;
} {
  const allowed: RoleFlavor[] = ["leadership", "ic", "mixed", "unknown"];

  // Search the head of the buffer for the tag. If found, strip it and
  // return whatever else was in that head plus the rest of the text.
  const head = text.slice(0, FLAVOR_SCAN_WINDOW);
  const match = head.match(FLAVOR_TAG_RE);
  if (match && typeof match.index === "number") {
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;
    const before = text.slice(0, tagStart).replace(/\s+$/, "");
    const after = text.slice(tagEnd).replace(/^\s+/, "");
    const remaining =
      before.length > 0 && after.length > 0 ? `${before}\n\n${after}` : before + after;
    const raw = (match[1] ?? "").toLowerCase();
    const flavor: RoleFlavor = (allowed as string[]).includes(raw)
      ? (raw as RoleFlavor)
      : "unknown";
    return { done: true, flavor, remaining };
  }

  // No tag found yet. If the buffer is already past the scan window,
  // there isn't going to be one — stream as-is.
  if (text.length >= FLAVOR_SCAN_WINDOW) {
    return { done: true, flavor: null, remaining: text };
  }

  // Buffer is short and there's no tag yet. Two possibilities:
  //   (a) a tag is forming somewhere in the buffer and we just need
  //       more characters before the closing </flavor> arrives
  //   (b) this is a non-JD response (follow-up) and there's no tag.
  // If the buffer contains "<" anywhere, treat it as case (a) and wait.
  // Otherwise treat as (b) and stream immediately.
  if (text.includes("<")) {
    return { done: false, flavor: null, remaining: "" };
  }
  return { done: true, flavor: null, remaining: text };
}

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "dev-bypass";
const USE_BYPASS = TURNSTILE_SITE_KEY === "dev-bypass";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Banner =
  | { kind: "rebuff"; tier: number; message: string }
  | { kind: "redirect"; message: string }
  | { kind: "fetch_failed"; message: string }
  | { kind: "closed"; message: string; permanent?: boolean; cooldownUntil?: number | null }
  | { kind: "locked"; message: string; permanent?: boolean; until?: number | null }
  | { kind: "error"; message: string };

type Status = "idle" | "submitting" | "streaming" | "closed";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function FitTool({
  onRoleFlavor,
}: {
  /** Called when the bot signals a role-flavor classification for a JD eval. */
  onRoleFlavor?: (flavor: RoleFlavor) => void;
} = {}) {
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const onRoleFlavorRef = useRef(onRoleFlavor);
  useEffect(() => {
    onRoleFlavorRef.current = onRoleFlavor;
  }, [onRoleFlavor]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    USE_BYPASS ? "dev-bypass" : null,
  );
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  // Detect platform on mount so the keyboard hint shows ⌘ on macOS /
  // iPadOS and Ctrl on Windows / Linux / ChromeOS. SSR defaults to
  // Ctrl so the static render doesn't lie to Windows users; macOS
  // visitors see the swap on hydration.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    setIsMac(/Mac|iPhone|iPad/.test(`${ua} ${platform}`));
  }, []);
  // Once the server has accepted a Turnstile token for this session, follow-up
  // messages can send a placeholder; the server caches the verified state with
  // a rolling 30 minute TTL. Keeps the chat fast and quiet after the first
  // round-trip.
  const [sessionVerified, setSessionVerified] = useState(USE_BYPASS);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track the previous status so we can auto-focus the textarea after
  // any state transition that ends with "ready for next input."
  const prevStatusRef = useRef<Status>("idle");

  const sessionClosed = status === "closed";
  const canSubmit =
    !sessionClosed &&
    input.trim().length > 0 &&
    status !== "submitting" &&
    status !== "streaming" &&
    (sessionVerified || turnstileToken !== null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText]);

  // Auto-focus the textarea whenever we transition into the "idle"
  // state from a state where the user couldn't type (mid-request) or
  // from a closed session (after Start a new conversation). Skip the
  // initial mount so the page doesn't yank focus on load.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (
      status === "idle" &&
      (prev === "streaming" || prev === "submitting" || prev === "closed")
    ) {
      // preventScroll keeps the user wherever they were reading without
      // forcing the page back to the input field.
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken(null);
    setBanner({
      kind: "error",
      message: "Verification widget hit an error. Refresh the page and try again.",
    });
  }, []);

  const reset = useCallback(() => {
    setSessionId(newSessionId());
    setMessages([]);
    setStreamingText("");
    setBanner(null);
    setInput("");
    setStatus("idle");
    setSessionVerified(USE_BYPASS);
    if (USE_BYPASS) setTurnstileToken("dev-bypass");
    else {
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    }
  }, []);

  const submit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!sessionVerified && !turnstileToken) {
      setBanner({ kind: "error", message: "Hold on a sec. Still verifying you're human." });
      return;
    }

    setStatus("submitting");
    setBanner(null);
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    // First submit in a session uses the real Turnstile token; subsequent
    // submits ride the server-side session verification cache. The token
    // is NOT nulled out after submit — keeping it in state prevents the
    // widget from re-mounting between submit-fire and response-handled,
    // which was causing a visible re-check on every send.
    const tokenForThisRequest = sessionVerified
      ? "session-verified"
      : turnstileToken!;

    let res: Response;
    try {
      res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userInput: trimmed,
          turnstileToken: tokenForThisRequest,
        }),
      });
    } catch (err) {
      setStatus("idle");
      setBanner({
        kind: "error",
        message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      });
      return;
    }

    if (res.status === 401) {
      // Turnstile failed server-side. Force a fresh check on the next
      // submit by clearing the cached token and re-executing the widget.
      setSessionVerified(false);
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
    } else if (!sessionVerified) {
      // Anything that's NOT a 401 means the server has accepted our
      // session (token verified, or session was already cached). Mark
      // verified client-side so follow-ups skip the widget.
      setSessionVerified(true);
    }

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data = (await res.json().catch(() => null)) as
        | { kind: string; [k: string]: unknown }
        | null;
      if (!data) {
        setStatus("idle");
        setBanner({ kind: "error", message: "Couldn't parse response." });
        return;
      }
      handleJsonResponse(data);
      setStatus(data.kind === "session_closed" ? "closed" : "idle");
      return;
    }

    setStatus("streaming");
    setStreamingText("");
    const reader = res.body?.getReader();
    if (!reader) {
      setStatus("idle");
      setBanner({ kind: "error", message: "Stream not available." });
      return;
    }
    const decoder = new TextDecoder();
    let rawBuffer = "";
    // Display = leadingContent + rawBuffer.slice(contentStartOffset).
    // Once we parse (or give up on) the flavor tag, these two values are
    // locked for the rest of the stream so subsequent chunks just slide
    // into place after the tag without ever resurfacing it.
    let leadingContent = "";
    let contentStartOffset = 0;
    let flavorParsed = false;
    let displayed = "";

    const computeDisplayed = (): string =>
      leadingContent + rawBuffer.slice(contentStartOffset);

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        rawBuffer += chunk;

        if (!flavorParsed) {
          const head = rawBuffer.slice(0, 200);
          const match = head.match(FLAVOR_TAG_RE);
          if (match && typeof match.index === "number") {
            // Tag landed; lock the offsets.
            const tagStart = match.index;
            const tagEnd = tagStart + match[0].length;
            const allowed: RoleFlavor[] = [
              "leadership",
              "ic",
              "mixed",
              "unknown",
            ];
            const raw = (match[1] ?? "").toLowerCase();
            const flavor: RoleFlavor = (allowed as string[]).includes(raw)
              ? (raw as RoleFlavor)
              : "unknown";
            onRoleFlavorRef.current?.(flavor);

            // Skip whitespace immediately following the closing tag.
            let after = tagEnd;
            while (
              after < rawBuffer.length &&
              /\s/.test(rawBuffer.charAt(after))
            ) {
              after++;
            }
            contentStartOffset = after;

            // Preserve any non-whitespace prefix the bot wrote before
            // the tag (unusual, but handle gracefully).
            const beforeRaw = rawBuffer.slice(0, tagStart).replace(/\s+$/, "");
            leadingContent =
              beforeRaw.length > 0 ? `${beforeRaw}\n\n` : "";

            flavorParsed = true;
            displayed = computeDisplayed();
            setStreamingText(displayed);
          } else if (rawBuffer.length >= 200) {
            // No tag in the first 200 chars; this is a non-JD response
            // (follow-up) or the bot skipped the tag. Stream as-is.
            flavorParsed = true;
            contentStartOffset = 0;
            leadingContent = "";
            displayed = rawBuffer;
            setStreamingText(displayed);
          }
          // Else: keep buffering; tag might still be assembling.
        } else {
          displayed = computeDisplayed();
          setStreamingText(displayed);
        }
      }
    } catch (err) {
      setStatus("idle");
      setBanner({
        kind: "error",
        message: `Stream interrupted: ${err instanceof Error ? err.message : "unknown"}`,
      });
      return;
    }

    // If the stream ended before we ever decided about the flavor (a
    // very short response that fit entirely in the buffer-wait window),
    // flush whatever is there without stripping.
    if (!flavorParsed) {
      flavorParsed = true;
      contentStartOffset = 0;
      leadingContent = "";
      displayed = rawBuffer;
      setStreamingText(displayed);
    } else {
      // Stream ended after parsing; make sure the final state reflects
      // any trailing chunk that arrived between iterations.
      displayed = computeDisplayed();
    }

    setMessages((prev) => [...prev, { role: "assistant", content: displayed }]);
    setStreamingText("");
    setStatus("idle");
  }, [input, sessionId, turnstileToken, sessionVerified]);

  function handleJsonResponse(data: { kind: string; [k: string]: unknown }) {
    switch (data.kind) {
      case "rebuff":
      case "redirect":
      case "fetch_failed": {
        // Speak in-character via the bot bubble. No separate banner —
        // a duplicate notification would just read as noise.
        const message = String(data.message ?? "");
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        return;
      }
      case "session_closed": {
        const message = String(data.message ?? "");
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        setBanner({
          kind: "closed",
          message: "Conversation closed. Refresh or start a new one below.",
          permanent: Boolean(data.permanent),
          cooldownUntil: (data.cooldownUntil as number | null) ?? null,
        });
        return;
      }
      case "lockout": {
        const message = String(data.message ?? "");
        setBanner({
          kind: "locked",
          message,
          permanent: Boolean(data.permanent),
          until: (data.until as number | null) ?? null,
        });
        return;
      }
      case "error":
      default: {
        setBanner({
          kind: "error",
          message: String(data.message ?? "Something went wrong."),
        });
      }
    }
  }

  const placeholder = useMemo(() => {
    if (messages.length === 0) {
      return "Paste a job description, drop a job-board URL, or just ask: how would Jared fit the role you're hiring for?";
    }
    return "Ask a follow-up…";
  }, [messages.length]);

  const hasTranscript = messages.length > 0 || streamingText.length > 0;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerEyebrow}>Honest fit, on demand</span>
        <h2 className={styles.headerTitle}>Talk to the bot</h2>
        <p className={styles.headerHint}>
          Try a real JD. Try to break it. Both are useful data points.
        </p>
      </div>

      {hasTranscript && (
        <div ref={transcriptRef} className={styles.transcript}>
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {streamingText && (
            <MessageBubble role="assistant" content={streamingText} streaming />
          )}
        </div>
      )}

      {banner && <BannerView banner={banner} />}

      {sessionClosed ? (
        <div className={styles.closedActions}>
          <button
            type="button"
            onClick={reset}
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={banner?.kind === "locked"}
          >
            Start a new conversation
          </button>
        </div>
      ) : (
        <div className={styles.inputWrap}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={placeholder}
            rows={4}
            disabled={status === "submitting" || status === "streaming"}
            className={styles.textarea}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (canSubmit) submit();
              }
            }}
          />

          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              {USE_BYPASS ? (
                <span>Turnstile bypass active (dev mode)</span>
              ) : sessionVerified || turnstileToken !== null ? (
                <span>✓ Verified for this session</span>
              ) : (
                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onVerify={handleTurnstileVerify}
                  onError={handleTurnstileError}
                  onExpire={() => setTurnstileToken(null)}
                  resetKey={turnstileResetKey}
                />
              )}
            </div>
            <div className={styles.controlsRight}>
              <span className={styles.kbdHint}>
                <span className={styles.kbd}>{isMac ? "⌘" : "Ctrl"}</span>{" "}
                <span className={styles.kbd}>↵</span> to send
              </span>
              {(status === "submitting" || status === "streaming") && (
                <span className={styles.spinner} aria-hidden />
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {status === "submitting"
                  ? "Sending…"
                  : status === "streaming"
                    ? "Generating…"
                    : messages.length === 0
                      ? "Analyze fit"
                      : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className={`${styles.bubbleRow} ${styles[role]}`}>
      <div
        className={`${styles.bubble} ${role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
      >
        {role === "user" ? (
          content
        ) : (
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
        {streaming && <span className={styles.streamingCursor} aria-hidden />}
      </div>
    </div>
  );
}

function BannerView({ banner }: { banner: Banner }) {
  const classMap: Record<Banner["kind"], string> = {
    rebuff: styles.bannerRebuff,
    redirect: styles.bannerRedirect,
    fetch_failed: styles.bannerFetchFailed,
    closed: styles.bannerClosed,
    locked: styles.bannerLocked,
    error: styles.bannerError,
  };
  return (
    <div className={`${styles.banner} ${classMap[banner.kind]}`}>
      {banner.message}
    </div>
  );
}
