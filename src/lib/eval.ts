import { anthropic, CACHE_TTL, MODELS } from "@/lib/anthropic";
import { profileContent } from "@/lib/brief";
import { buildSystemPrompt } from "@/lib/fit-prompt";
import { Role, type MessageRecord } from "@/lib/types";

let last: { profile: string; prompt: string } | null = null;

/**
 * The full Fit Bot system prompt (fixed prose + the brief). Rebuilt only
 * when the brief changes (an upload), so the string, and the Anthropic
 * prompt-cache prefix it feeds, stays identical between updates.
 */
export async function getSystemPrompt(): Promise<string> {
  const profile = await profileContent();
  if (last?.profile !== profile) {
    last = { profile, prompt: buildSystemPrompt(profile) };
  }
  return last.prompt;
}

function isFollowUp(history: MessageRecord[]): boolean {
  return history.some((m) => m.role === Role.User);
}

export function buildEvalRequest(
  history: MessageRecord[],
  userInput: string,
  systemPrompt: string,
) {
  const tag = isFollowUp(history) ? "follow_up" : "job_description";

  const messages: Array<{ role: Role; content: string }> = [];

  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({
    role: Role.User,
    content: `<${tag}>\n${userInput}\n</${tag}>`,
  });

  return {
    model: MODELS.mainEval,
    max_tokens: 1024,
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        // 1h in prod (long-lived warm cache across recruiter visits),
        // 5m in dev (cheaper writes during iteration). See anthropic.ts.
        cache_control: { type: "ephemeral" as const, ttl: CACHE_TTL },
      },
    ],
    messages,
  };
}

/**
 * Start a streamed evaluation. Returns the SDK's MessageStream so the
 * caller can iterate text deltas and pipe them to the client.
 */
export function startEvalStream(
  history: MessageRecord[],
  userInput: string,
  systemPrompt: string,
) {
  return anthropic().messages.stream(
    buildEvalRequest(history, userInput, systemPrompt),
  );
}
