---
description: Generate a tailored CV for Jared from a job posting URL, a file path, or pasted JD text
argument-hint: <url, file path, or JD text>
---

# Generate a tailored CV for: $ARGUMENTS

You are generating Jared Malcolm's CV tailored to a specific job posting. The argument above is one of:

- **A URL** to a job posting. Fetch it with WebFetch.
- **A file path** to a `.txt` or `.md` document containing the JD body. Read it with the Read tool. Suggested convention: drop long JDs into `jd-input/` at repo root and pass `jd-input/<filename>`.
- **Pasted JD text** (short enough to fit in the prompt). Treat the argument itself as the JD body.
- **A company name plus role title with no JD body**. Stop and ask Jared for the full JD, a URL, or a file path. Do not proceed on thin input.

## Step 1 — Get the JD content

Detect the mode from the shape of $ARGUMENTS:

1. **URL mode** — argument starts with `http://` or `https://`. Use WebFetch.
2. **File mode** — argument looks like a path (contains `/` or `\`, ends in `.txt` / `.md` / `.markdown`, or is a single token that exists on disk). Use the Read tool. If the path is relative, resolve it from the repo root (`c:\Users\jared\Sites\jared-dev`). If the read fails (file not found, permission error), stop and tell Jared which path you tried.
3. **Pasted text mode** — argument is multi-line prose with no URL or path signal. Treat the whole thing as the JD body.

Once you have the JD body, parse it for:

- Company name
- Role title and level (IC, Senior IC, Lead, Manager, Director, Head)
- Must-have requirements
- Nice-to-have requirements
- Location and remote policy
- Comp range (if present)

If the parsed content is too thin to work with (just a company name, or a title with no requirements), stop and ask Jared for more. Do not invent a JD.

If you used file mode, also add `jd-input/` to `.gitignore` if it isn't already there. These files contain recruiter-supplied content and may have identifying details Jared doesn't want committed.

## Step 2 — Load source-of-truth profile material

Read these files in order. They are the only sources of fact for the CV:

1. `PROFILE_BRIEF.md` — Jared's full profile. Read all of Part 2. Do not skip Honest Gaps.
2. `src/lib/profile.ts` — `RECOMMENDATION` constant for the letter pointer and blurb.
3. `public/recommendation.pdf` — only if you need the letter's full text for a quotable line (one short pull, max, per CV).

If anything in the JD asks for something not covered by these sources, you do not know it. Do not fabricate.

## Step 3 — Plan the CV before writing

Decide explicitly:

- **Headline level**. Match the JD. Director JD gets the Director headline from PROFILE_BRIEF. Manager JD gets a Manager-tuned variant. IC JD at an established employer (Mailchimp, Jack Henry, etc.) gets the Senior IC framing per PROFILE_BRIEF's "What's Next" rules. Never overclaim.
- **Top 3 to 5 matches** between the JD's must-haves and Jared's actual experience. Tie each to a specific role entry or signature outcome from PROFILE_BRIEF. No generic claims.
- **Gaps to handle**, governed strictly by PROFILE_BRIEF "Honest Gaps" and "Real gaps vs. days-pickup work":
  - **Real LANGUAGE gap** (Python, Go, etc.) explicitly named in the JD as required: acknowledge briefly, once.
  - **Real EXPERIENCE gap** (IPO/M&A, multi-EM org, OSS maintainership, public speaking) explicitly required: acknowledge briefly, once.
  - **Days-pickup work** (Lit, RSC, Module Federation, specific build tools, UI libraries, CSS-in-JS variants, state libraries): do NOT acknowledge as a gap. If the JD names one, just include it in Skills. The brief is explicit: a 14-year FE specialist fluent in JS/TS picks these up in days.
  - **Skill gaps NOT explicitly named in the JD**: do not surface. Honesty is reactive in the brief; the CV follows the same rule.
- **Skills order**: skills the JD names first. Do not pad with skills the JD does not ask for. Do not include "Soft Skills" or similar filler categories.
- **One letter pull**: pick the single best Mallerie quote for this JD's frame. Use it once, near the summary or at the end.

## Step 4 — Compose the CV

Write Markdown to `cv-output/cv-<company-slug>-<role-slug>-<YYYY-MM-DD>.md`. Create `cv-output/` if it does not exist. Add `cv-output/` to `.gitignore` if not already there (these are tailored per JD and should not be committed).

Use this structure:

### Header

```markdown
# Jared Malcolm
Frontend Engineering Leader · Joplin, MO area · Central Time · Remote-first

jareddev.com · linkedin.com/in/jaredmalcolm · github.com/Jared-Dev
Contact via jareddev.com/contact
```

Do not inline email or phone. Per PROFILE_BRIEF's contact-gating architecture, contact lives behind the site's Turnstile reveal. The CV points at jareddev.com/contact, not at raw strings.

### Headline (1 sentence)

JD-level tuned. Use the locked primary from PROFILE_BRIEF or one of the alternates, adjusted to match the JD's title.

### Summary (3 to 4 sentences)

Lead with the right anchor for this JD:

- Director or Manager JD → lead with the Director-returning narrative.
- Senior IC at an established employer → lead with the senior IC framing and the Mailchimp recency.
- Hybrid / unclear → lead with the 14-year arc and Director identity, mention IC bridge honestly.

End the summary with one short pull from Mallerie's letter, attributed (e.g. *"His Tensure manager Mallerie Shirley describes him as 'among the most well-rounded engineers I have had the pleasure of working with.'"*).

### Selected Experience

4 to 6 roles. Order by relevance to the JD, not chronology, unless the JD's level wants the most recent role first. For each:

- Role title, company, dates.
- 3 to 5 bullets weighted toward what the JD asks for.
- Use concrete proof points from PROFILE_BRIEF where available (Wayfair 50ms first-paint, Midwestern 30s-to-1s query, the ATS still in use, hire counts, etc.). Defensible numbers beat adjectives.
- Mailchimp via Tensure framing: **"Senior Software Engineer (contract) · Tensure Consulting"** with bullets that name the Mailchimp engagement. Never list "Mailchimp" as the employer.
- Redacted Director seat: **"Director of Engineering · Confidential (early-stage B2B SaaS, industrial operations)"**. Do not name the company.
- NDA-bound Mailchimp specifics stay generic ("multiple shipped production segmentation features"; not feature names).

### Skills

Categorized, ordered by JD relevance. Use PROFILE_BRIEF's depth ratings as the floor for honesty:

- If the brief says **familiar** or **never**, do not list as a strength.
- If the brief says **working**, list it but do not lead with it.
- If the brief says **strong** or **deep**, list it confidently.

### Education

Associates of Science in Computer Information Systems · Missouri Southern State University · 2012.

### Side leadership (include only if relevant)

Include if the JD reads founder-y, scrappy, ops-heavy, or if the company values demonstrated outside-work leadership: Ozark Bee Barn (seasonal bee operation), Beetle Crusher and CombSafe Clip productization with national distribution through Dadant and Sons, Member-at-Large on the Missouri State Beekeepers Association board, President of the local beekeeping club.

Skip the bee section if the JD is large-enterprise corporate and would read the detail as noise. Use judgment.

## Step 5 — Report decisions to Jared

After writing the file, print a summary:

1. **File path written.**
2. **Top 3 experiences emphasized** and which JD requirement each maps to.
3. **Gaps acknowledged** (with the line you used) and **gaps reframed** as days-pickup (with the JD term you handled).
4. **Any JD requirement you did not address**, with the reason (genuinely absent from Jared's profile, vs. deliberately not surfaced because not required by the JD).
5. **One follow-up suggestion** if relevant. Examples: "JD asks for production Python; consider whether to apply at all per PROFILE_BRIEF Honest Gaps." Or: "JD's comp range came in below the floor; the bot's compensation rules apply to the cover letter too."

## Non-negotiable rules

- **Never fabricate.** Only material from PROFILE_BRIEF.md and the recommendation letter is allowed.
- **No em-dashes, no en-dashes, anywhere in the CV.** Use periods, commas, "and", or colons. They read as AI tells and Jared has flagged this as a hard rule.
- **No corporate fluff.** No "passionate about", no "results-driven", no "love building great teams". Per PROFILE_BRIEF Site Tone section.
- **Honesty is reactive.** Do not volunteer weaknesses in the summary or experience bullets. Address gaps only when the JD specifically asks for the skill.
- **Compensation**: never state Jared's range, floor, or threshold. Per PROFILE_BRIEF Compensation rules.
- **Mailchimp = contracted via Tensure**, never employed by Mailchimp.
- **Redacted Director seat**: "Confidential" framing. Do not name the company.
- **Recommendation letter**: one pull per CV, maximum. The CV's job is to point at the letter on jareddev.com, not to recite it.
- **IC roles at established employers are positive signal**, per PROFILE_BRIEF "What's Next". Do not apologize for the title gap when the JD is IC and the company is one Jared wants to be at.
- **Output goes to a file**, not the chat. The chat output is the summary in step 5, not the CV body.
