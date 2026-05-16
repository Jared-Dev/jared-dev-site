---
description: Run the same Fit Tool eval the live site would run, against $ARGUMENTS, using Claude Code's session instead of Jared's Anthropic key
argument-hint: <url, file path, or JD text>
---

# Audit a JD with the live Fit Bot's prompt: $ARGUMENTS

You are about to produce a Fit Bot evaluation locally. The goal is to
generate the **same output** the production /api/fit route would
generate for this JD, against the same brief, with the same system
prompt. The eval runs against your Claude Code session so it does not
consume the production Anthropic API key.

## Step 1 — Get the JD body

Detect the shape of $ARGUMENTS and resolve it:

1. **URL** (starts with `http://` or `https://`): use **WebFetch** to
   pull the page. The Fit Tool itself strips chrome via Readability;
   you can do the equivalent inline by ignoring page navigation,
   footer, and search bars and focusing on the role posting body.
2. **File path** (single token, exists on disk, ends in `.pdf`,
   `.docx`, `.txt`, or `.md`): use the **Read** tool. Read handles
   PDF natively. For `.docx`, if Read can't parse it cleanly, ask
   Jared to convert to PDF or paste the text and stop. Resolve
   relative paths from the repo root
   (`c:\Users\jared\Sites\jared-dev`) or from `$HOME`.
3. **Pasted text**: anything else is treated as the JD body
   directly.

If the resolved JD body is shorter than ~80 characters or looks like
just a company name with no requirements, stop and ask Jared for the
real JD content. Do not proceed on thin input.

## Step 2 — Load the system prompt template and brief

Read these two files:

1. `src/lib/fit-prompt.ts` — contains `buildSystemPrompt(profile: string)`.
   The template is the entire string the function returns. Treat the
   contents between the opening backtick and the closing backtick as
   the system prompt, with `${profile}` as a placeholder you will
   substitute in the next step.

2. `PROFILE_BRIEF.md` — the source-of-truth brief. Locate the section
   between the `## Part 2` heading and the `## Part 3` heading. Strip
   the `## Part 2` heading line itself and any trailing `---` rule.
   That trimmed body is the `profile` string. (This matches what
   `extractProfileFromBrief` in `src/lib/fit-prompt.ts` does at
   runtime.)

Now substitute the profile body into the template's `${profile}`
placeholder. The result is your **system prompt** for this turn.

## Step 3 — Adopt the system prompt

The system prompt you just constructed is canonical. It contains:

- The Fit Bot persona, conversational posture, and rebuff rules
- The full profile inline (Part 2 of the brief)
- Output shape rules including the `<flavor>X</flavor>` leading tag
  for JD evals

You ARE the Fit Bot for the next response. Not "evaluating the Fit
Bot's behavior", not "summarizing what it would say". You generate
exactly what it would generate.

## Step 4 — Generate the eval

Treat the JD body from Step 1 as the user message, wrapped exactly
like the production route wraps it:

```text
<job_description>
<JD body here>
</job_description>
```

Produce the response per the system prompt's "Response shape" section,
with one local-rendering adjustment for the audit context:

1. **Do NOT emit a raw `<flavor>X</flavor>` tag at the top of the
   eval.** In production, the /api/fit route strips that tag
   server-side before the UI ever renders it. Locally, the Claude
   Code / VSCode extension renderer parses the tag as HTML and eats
   the surrounding content, which hides the eval entirely. Decide
   the flavor (`leadership`, `ic`, `mixed`, or `unknown`) per the
   rules in the system prompt, hold it back from the rendered eval,
   and report it in the post-eval section in Step 5. The eval body
   itself starts directly with the fit prose.
2. Follow the system prompt's Conversational Posture section.
3. Close with the action-routing beat (Fit Tool follow-up, /contact,
   or "happy to answer specific questions").
4. Honor every other rule in the system prompt: third-person voice,
   no compensation numbers, no fabrication, no em-dashes or
   en-dashes, the bee-closer guard (only when all four conditions
   are met), etc.

Do NOT add meta-commentary before the response. Do NOT explain what
you're doing. Do NOT preface with "Here's how the Fit Bot would
respond". Just respond as the Fit Bot.

## Step 5 — After the eval

Once the Fit Bot response is delivered, drop the persona and report
briefly to Jared:

1. **Flavor classified**: the value (`leadership`, `ic`, `mixed`, or
   `unknown`) and a one-sentence reason. This is the ONLY place the
   classification appears in the audit output, since the raw tag is
   suppressed in the eval body per Step 4.
2. **Strongest fit point** you led with.
3. **Gaps surfaced** (if any) and why they qualified per the brief's
   reactive-honesty rules.
4. **Anything in the JD you weren't sure how to handle** — the kind
   of feedback that would inform a prompt or brief revision.

Keep the post-eval report under 150 words. Its job is to surface
audit-worthy observations, not to re-summarize the eval.

## Non-negotiables

- **No fabrication.** Only material from the brief's Part 2 is
  allowed. If the JD asks for something not in the profile,
  acknowledge it per the system prompt's reactive-honesty rules.
  Never invent experience Jared doesn't have.
- **The system prompt is canonical.** If anything in this command
  file conflicts with the rendered system prompt from Step 2, the
  system prompt wins.
- **Do not consume Jared's Anthropic key.** This command exists
  precisely to avoid that. Stay in your Claude Code session.
- **JD requirement bullets are JD copy, not probes.** Do NOT surface
  gaps against nice-to-haves the JD lists but doesn't probe. For
  must-haves where Jared has a gap, the same rule applies: lead with
  the matches; gaps stay unmentioned unless the recruiter follows up
  by name. The post-eval audit report is the right place to log
  gaps for Jared's review, not the eval body the recruiter sees.
