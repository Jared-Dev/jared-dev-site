import { z } from "zod";
import { clientIp, hashIdentity } from "@/lib/identity";
import { bypassesScreen, classify } from "@/lib/classifier";
import { getSystemPrompt, startEvalStream } from "@/lib/eval";
import { FIT_TRACE_HEADER, encodeFitTrace } from "@/lib/fit-trace";
import { buildFitTrace } from "@/lib/fit-trace-build";
import {
  assessIntake,
  shouldEscalateScreen,
  type IntakeAssessment,
} from "@/lib/intake";
import { isJevEnabled } from "@/lib/jev";
import { fetchJobDescription, parseJdUrl } from "@/lib/jd-fetch";
import { checkUserInputLength } from "@/lib/fit-input-limits";
import { COOLDOWN_MESSAGES, rebuffForTier, redirect } from "@/lib/rebuff";
import {
  closeSessionWithOffense,
  loadTurnContext,
  logEventAfter,
  recordFlag,
  saveTurnAfter,
  type FlagEvent,
} from "@/lib/state";
import { CACHE_TTL } from "@/lib/anthropic";
import { getCachedResponse, setCachedResponseAfter } from "@/lib/response-cache";
import {
  AnthropicModel,
  buildUsageRecord,
  logUsageAfter,
  type UsageInput,
} from "@/lib/usage-log";
import { passGate } from "@/lib/verified-visitor";
import { Role, Verdict, type ClassifierResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The user-input upper bound is enforced below via checkUserInputLength so
// an over-limit paste gets a specific, recruiter-facing message instead of
// the generic "Invalid request" that reads as "Something went wrong." in the
// UI. The schema only guards presence and a non-empty string here.
const requestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  userInput: z.string().min(1),
  turnstileToken: z.string().min(1),
});

/**
 * Per-request state the handler hands back to the POST wrapper. Lets the
 * gate's rolling verified-visitor cookie ride on every response without
 * threading a Set-Cookie header through every return path below.
 */
interface FitResponseExtras {
  setCookie: string | null;
}

export async function POST(req: Request) {
  const extras: FitResponseExtras = { setCookie: null };
  const res = await handleFit(req, extras);
  if (extras.setCookie) res.headers.append("Set-Cookie", extras.setCookie);
  return res;
}

async function handleFit(
  req: Request,
  extras: FitResponseExtras,
): Promise<Response> {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const { sessionId, userInput, turnstileToken } = parsed.data;

  // Reject over-long input before any Turnstile / classifier / model work.
  // 413 carries a kind-tagged message so the client surfaces the specific
  // reason rather than a generic error banner.
  const lengthCheck = checkUserInputLength(userInput);
  if (!lengthCheck.ok) {
    return jsonResponse({ kind: "error", message: lengthCheck.message }, 413);
  }

  // Turnstile once per visitor: a valid verified-visitor cookie skips the
  // Cloudflare round trip, so follow-up messages (which send a
  // placeholder token) pass on the cookie. Each pass re-issues it, which
  // keeps the 30-minute window rolling and also unlocks /api/resume, so
  // a resume link the bot hands out opens in this browser.
  const gate = await passGate(req, turnstileToken);
  if (!gate.ok) {
    return jsonResponse(
      { kind: "error", message: "Verification failed. Refresh and try again." },
      401,
    );
  }
  extras.setCookie = gate.setCookie;

  const idHash = hashIdentity(clientIp(req), req.headers.get("user-agent"));

  // In parallel: the system prompt (brief from Postgres, cached per
  // instance, so free when warm) and one round trip that upserts the
  // session, reads the identity's lockout, and loads recent history.
  // The turn context is fail-open (database down: fresh, unlocked
  // session, no history); the prompt is required.
  const [prompt, { lockout, session, history }] = await Promise.all([
    getSystemPrompt().then(
      (text) => ({ ok: true as const, text }),
      (err: unknown) => ({ ok: false as const, err }),
    ),
    loadTurnContext(sessionId, idHash),
  ]);
  if (!prompt.ok) {
    console.error("[fit] System prompt unavailable:", prompt.err);
    return jsonResponse(
      {
        kind: "error",
        message: "The Fit Tool is briefly unavailable. Try again in a minute.",
      },
      503,
    );
  }
  const systemPrompt = prompt.text;

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
  let sourceHost: string | null = null;
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
    sourceHost = maybeUrl.hostname;
  }

  const turn = Math.floor(history.length / 2) + 1;

  // Jev reads the message (kind, level, work model, frontend lean) for
  // the thinking trace. It never blocks or strikes. Its one say in
  // safety: a long input that would skip the Haiku screen gets screened
  // anyway when Jev reads it as talking to an AI. Short inputs always
  // hit Haiku, so there Jev runs alongside it and adds no latency.
  // assessIntake returns null on any Jev failure, which leaves the
  // pre-Jev behavior untouched.
  const jevEnabled = isJevEnabled();
  const intakePromise: Promise<IntakeAssessment | null> = jevEnabled
    ? assessIntake(effectiveInput).catch(() => null)
    : Promise.resolve(null);
  let intake: IntakeAssessment | null;
  let result: ClassifierResult;
  if (bypassesScreen(effectiveInput)) {
    intake = await intakePromise;
    const forceScreen = shouldEscalateScreen(intake);
    if (forceScreen && process.env.NODE_ENV === "development") {
      console.log(
        `[jev] escalating long input to Haiku screen (p=${intake?.manipulation.toFixed(2)})`,
      );
    }
    result = await classify(history, effectiveInput, { forceScreen });
  } else {
    [intake, result] = await Promise.all([
      intakePromise,
      classify(history, effectiveInput),
    ]);
  }

  const flagEvent: FlagEvent = {
    sessionId,
    identityHash: idHash,
    verdict: result.verdict,
    type: result.type,
    reason: result.reason,
    input: effectiveInput,
    turn,
  };

  if (result.verdict === Verdict.Redirect) {
    logEventAfter(flagEvent, session.strikes);
    return jsonResponse({ kind: "redirect", message: redirect() });
  }

  if (result.verdict === Verdict.Flag) {
    // Strike + event log in one statement.
    const newStrikes = await recordFlag(flagEvent, session.strikes);

    if (newStrikes >= 3) {
      const message = rebuffForTier(3);
      // Session close + offense ladder in one statement.
      const offense = await closeSessionWithOffense(sessionId, idHash);
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

  // SAFE: stream the main evaluator. The turn (user message + reply) is
  // saved after the response is sent, so persistence never adds latency.
  const userMessage = {
    role: Role.User,
    content: effectiveInput,
    timestamp: Date.now(),
  };

  // The thinking trace rides in a header so the client can render it
  // before the first streamed token, without touching the body format
  // that the response cache stores and replays.
  const traceFor = (cached: boolean) =>
    encodeFitTrace(buildFitTrace({ jevEnabled, intake, sourceHost, cached }));

  // Response cache check, first turn of a fresh session only. Same JD
  // content + same prompt version returns the prior bot response without
  // calling Anthropic at all. Content changes (JD edit, brief edit,
  // system prompt edit) all produce a different cache key.
  if (history.length === 0) {
    const cached = await getCachedResponse(effectiveInput, systemPrompt);
    if (cached) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[response-cache] HIT · content=${cached.contentHash.slice(0, 8)} prompt=${cached.promptHash.slice(0, 8)}`,
        );
      }
      saveTurnAfter(sessionId, [
        userMessage,
        { role: Role.Assistant, content: cached.response, timestamp: Date.now() },
      ]);
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
          [FIT_TRACE_HEADER]: traceFor(true),
        },
      });
    }
  }

  const evalStream = startEvalStream(history, effectiveInput, systemPrompt);
  const fullParts: string[] = [];
  const encoder = new TextEncoder();

  // Resolves when the stream finishes (rejects on a stream error). The
  // deferred writes below are registered now, inside the request scope,
  // and wait on it; a failed stream just skips them.
  let finish!: (done: { text: string; usage: UsageInput }) => void;
  let fail!: (err: unknown) => void;
  const finished = new Promise<{ text: string; usage: UsageInput }>(
    (resolve, rejectFinished) => {
      finish = resolve;
      fail = rejectFinished;
    },
  );
  finished.catch(() => {});
  const reply = finished.then((f) => f.text);
  logUsageAfter(finished.then((f) => f.usage));
  saveTurnAfter(
    sessionId,
    reply.then((text) => [
      userMessage,
      { role: Role.Assistant, content: text, timestamp: Date.now() },
    ]),
  );
  // First-turn responses go into the content-keyed cache so a repeat
  // paste of the same JD inside the next week skips the Anthropic call.
  if (history.length === 0) {
    setCachedResponseAfter(effectiveInput, systemPrompt, reply);
  }

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
        const usage: UsageInput = {
          kind: "eval",
          model: AnthropicModel.Sonnet46,
          ttl: CACHE_TTL,
          cacheWriteTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          inputTokens,
          outputTokens,
        };
        if (process.env.NODE_ENV === "development") {
          const record = buildUsageRecord(usage);
          console.log(
            `[eval] ${record.status.toUpperCase()} · write=${cacheWrite} read=${cacheRead} in=${inputTokens} out=${outputTokens} cost=$${record.costUsd.toFixed(6)}`,
          );
        }
        finish({ text: fullParts.join(""), usage });
      } catch (err) {
        fail(err);
        controller.error(err);
      }
    },
  });

  return new Response(respStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-store",
      [FIT_TRACE_HEADER]: traceFor(false),
    },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
