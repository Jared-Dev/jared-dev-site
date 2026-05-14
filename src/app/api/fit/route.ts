import { z } from "zod";
import { clientIp, hashIdentity } from "@/lib/identity";
import { classify } from "@/lib/classifier";
import { startEvalStream } from "@/lib/eval";
import { fetchJobDescription, parseJdUrl } from "@/lib/jd-fetch";
import { COOLDOWN_MESSAGES, rebuffForTier, redirect } from "@/lib/rebuff";
import {
  appendMessage,
  ensureSession,
  getHistory,
  incrementStrikes,
  isLockedOut,
  logEvent,
  markSessionClosed,
  recordOffense,
} from "@/lib/state";
import { CACHE_TTL } from "@/lib/anthropic";
import { redis } from "@/lib/redis";
import { getCachedResponse, setCachedResponse } from "@/lib/response-cache";
import { verifyTurnstile } from "@/lib/turnstile";
import { logUsage } from "@/lib/usage-log";

const SESSION_TURNSTILE_TTL_SECONDS = 30 * 60;
const sessionTurnstileKey = (sid: string) => `session:${sid}:turnstile_ok`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  userInput: z.string().min(1).max(10_000),
  turnstileToken: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const { sessionId, userInput, turnstileToken } = parsed.data;

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  // Turnstile is required ONCE per session. After a successful check we
  // mark the session as verified in Redis with a rolling TTL so follow-up
  // messages within the next 30 minutes skip the round-trip to Cloudflare.
  // This is what makes multi-turn chat usable.
  const turnstileKey = sessionTurnstileKey(sessionId);
  const alreadyVerified = await redis().exists(turnstileKey);
  if (!alreadyVerified) {
    const turnstileOk = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileOk) {
      return jsonResponse(
        { kind: "error", message: "Verification failed. Refresh and try again." },
        401,
      );
    }
    await redis().set(turnstileKey, 1, { ex: SESSION_TURNSTILE_TTL_SECONDS });
  } else {
    // Rolling TTL: each verified request resets the 30 min clock so an
    // active conversation never gets kicked back to re-verification.
    await redis().expire(turnstileKey, SESSION_TURNSTILE_TTL_SECONDS);
  }

  const idHash = hashIdentity(ip, ua);

  const lockout = await isLockedOut(idHash);
  if (lockout.locked) {
    const message = lockout.permanent
      ? COOLDOWN_MESSAGES.permanent
      : COOLDOWN_MESSAGES.active(new Date(lockout.until!).toLocaleString());
    return jsonResponse(
      {
        kind: "lockout",
        permanent: Boolean(lockout.permanent),
        until: lockout.until ?? null,
        message,
      },
      423,
    );
  }

  const session = await ensureSession(sessionId);
  if (session.closedAt) {
    return jsonResponse(
      {
        kind: "session_closed",
        message: "This conversation is over. Refresh to start a new one.",
      },
      410,
    );
  }

  // If the user pasted a URL, fetch + extract it server-side before
  // classification. Fetch failures are returned as a friendly message
  // (no strike) so the recruiter can paste the JD text directly.
  let effectiveInput = userInput;
  const maybeUrl = parseJdUrl(userInput);
  if (maybeUrl) {
    const fetched = await fetchJobDescription(maybeUrl);
    if (!fetched.ok) {
      return jsonResponse({
        kind: "fetch_failed",
        sourceUrl: maybeUrl.href,
        message: `${fetched.reason} Paste the JD text and I'll take it from there.`,
      });
    }
    effectiveInput = `Source URL: ${fetched.sourceUrl}\n\n${fetched.text}`;
  }

  const history = await getHistory(sessionId);
  const turn = Math.floor(history.length / 2) + 1;

  const result = await classify(history, effectiveInput);

  if (result.verdict !== "SAFE") {
    await logEvent({
      timestamp: Date.now(),
      sessionId,
      identityHash: idHash,
      verdict: result.verdict,
      type: result.type,
      reason: result.reason,
      input: effectiveInput,
      strikeCount: session.strikes + (result.verdict === "FLAG" ? 1 : 0),
      turn,
    });
  }

  if (result.verdict === "REDIRECT") {
    return jsonResponse({ kind: "redirect", message: redirect() });
  }

  if (result.verdict === "FLAG") {
    const newStrikes = await incrementStrikes(sessionId);

    if (newStrikes >= 3) {
      const message = rebuffForTier(3);
      await markSessionClosed(sessionId);
      const offense = await recordOffense(idHash);
      return jsonResponse({
        kind: "session_closed",
        tier: 3,
        message,
        offense: offense.offenseCount,
        permanent: offense.permanent,
        cooldownUntil: offense.cooldownUntil,
      });
    }

    const tier = newStrikes as 1 | 2;
    return jsonResponse({
      kind: "rebuff",
      tier,
      strikes: newStrikes,
      message: rebuffForTier(tier),
    });
  }

  // SAFE: stream the main evaluator.
  await appendMessage(sessionId, {
    role: "user",
    content: effectiveInput,
    timestamp: Date.now(),
  });

  // Response cache check, first turn of a fresh session only. Same JD
  // content + same prompt version returns the prior bot response without
  // calling Anthropic at all. Content changes (JD edit, brief edit,
  // system prompt edit) all produce a different cache key.
  if (history.length === 0) {
    const cached = await getCachedResponse(effectiveInput);
    if (cached) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[response-cache] HIT · content=${cached.contentHash.slice(0, 8)} prompt=${cached.promptHash.slice(0, 8)}`,
        );
      }
      await appendMessage(sessionId, {
        role: "assistant",
        content: cached.response,
        timestamp: Date.now(),
      });
      const encoder = new TextEncoder();
      const cachedStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(cached.response));
          controller.close();
        },
      });
      return new Response(cachedStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache, no-store",
        },
      });
    }
  }

  const evalStream = startEvalStream(history, effectiveInput);
  const fullParts: string[] = [];
  const encoder = new TextEncoder();

  const respStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cacheWrite = 0;
      let cacheRead = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        for await (const event of evalStream) {
          if (event.type === "message_start") {
            const u = event.message.usage;
            cacheWrite = u.cache_creation_input_tokens ?? 0;
            cacheRead = u.cache_read_input_tokens ?? 0;
            inputTokens = u.input_tokens;
          } else if (event.type === "message_delta") {
            outputTokens = event.usage.output_tokens;
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullParts.push(chunk);
            controller.enqueue(encoder.encode(chunk));
          }
        }
        controller.close();
        const record = await logUsage({
          kind: "eval",
          model: "sonnet-4-6",
          ttl: CACHE_TTL,
          cacheWriteTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          inputTokens,
          outputTokens,
        });
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[eval] ${record.status.toUpperCase()} · write=${cacheWrite} read=${cacheRead} in=${inputTokens} out=${outputTokens} cost=$${record.costUsd.toFixed(6)}`,
          );
        }
        const fullText = fullParts.join("");
        await appendMessage(sessionId, {
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
        });
        // First-turn responses go into the URL/content-keyed cache so a
        // repeat paste of the same JD inside the next week returns the
        // saved response without burning another Anthropic call.
        if (history.length === 0 && fullText.length > 0) {
          void setCachedResponse(effectiveInput, fullText).catch(() => {
            // Cache write failures must not affect the request path.
          });
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(respStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-store",
    },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
