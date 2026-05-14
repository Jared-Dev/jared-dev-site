"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FitTool, type RoleFlavor } from "@/components/FitTool";
import styles from "./AdaptiveHome.module.css";
import pageStyles from "@/app/page.module.css";

type Mode = "mixed" | "leadership" | "ic";

const TOAST_BY_MODE: Record<Exclude<Mode, "mixed">, string> = {
  ic: "Since it looks like Jared would be a member of a team and not leading one, let me rearrange the room.",
  leadership: "Director-track read. Let me pull the leadership pieces to the front.",
};

const TOGGLE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "leadership", label: "Leadership" },
  { value: "mixed", label: "Both" },
  { value: "ic", label: "IC" },
];

const TOAST_TIMEOUT_MS = 7000;

function flavorToMode(flavor: RoleFlavor | null): Mode {
  if (flavor === "leadership") return "leadership";
  if (flavor === "ic") return "ic";
  return "mixed";
}

/**
 * Use the View Transitions API if available; otherwise just run the
 * state update inline. Either way callers get the updated state on the
 * next render. The browser handles the animation choreography from the
 * CSS rules in AdaptiveHome.module.css.
 */
function withViewTransition(update: () => void): void {
  if (typeof document === "undefined") return update();
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(update);
  } else {
    update();
  }
}

export function AdaptiveHome() {
  const [mode, setMode] = useState<Mode>("mixed");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userOverrodeRef = useRef(false);

  const setModeWithTransition = useCallback((next: Mode) => {
    withViewTransition(() => setMode(next));
  }, []);

  const showToastFor = useCallback((m: Exclude<Mode, "mixed">) => {
    setToastMessage(TOAST_BY_MODE[m]);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, TOAST_TIMEOUT_MS);
  }, []);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleRoleFlavor = useCallback(
    (flavor: RoleFlavor) => {
      if (userOverrodeRef.current) return;
      const next = flavorToMode(flavor);
      setModeWithTransition(next);
      if (next !== "mixed") showToastFor(next);
    },
    [setModeWithTransition, showToastFor],
  );

  const handleToggleClick = useCallback(
    (next: Mode) => {
      userOverrodeRef.current = true;
      setModeWithTransition(next);
      dismissToast();
    },
    [setModeWithTransition, dismissToast],
  );

  return (
    <div className={styles.shell}>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onClose={dismissToast}
      />

      <section id="fit">
        <div className={styles.fitWrap}>
          <div className={styles.fitInner}>
            <FitTool onRoleFlavor={handleRoleFlavor} />
          </div>
        </div>
      </section>

      <ToggleRow mode={mode} onChange={handleToggleClick} />

      <AboutSection mode={mode} />
      <QuoteSection mode={mode} />
      <StatsSection mode={mode} />
      <BeeSection />
      <StackSection />
    </div>
  );
}

/* ---------------- Toast ---------------- */

function Toast({
  visible,
  message,
  onClose,
}: {
  visible: boolean;
  message: string | null;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div
      className={`${styles.toast} ${visible ? styles.toastVisible : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.toastText}>{message}</span>
      <button
        type="button"
        className={styles.toastClose}
        onClick={onClose}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

/* ---------------- Toggle ---------------- */

const SELECTOR_POSITION: Record<Mode, string> = {
  leadership: styles.toggleSelectorLeadership,
  mixed: styles.toggleSelectorMixed,
  ic: styles.toggleSelectorIc,
};

function ToggleRow({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>Page tuned for</span>
      <div
        className={styles.toggle}
        role="radiogroup"
        aria-label="Page emphasis"
      >
        <span
          className={`${styles.toggleSelector} ${SELECTOR_POSITION[mode]}`}
          aria-hidden
        />
        {TOGGLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={mode === opt.value ? "true" : "false"}
            className={`${styles.toggleBtn} ${mode === opt.value ? styles.toggleBtnActive : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- About ---------------- */

function AboutSection({ mode }: { mode: Mode }) {
  return (
    <section className={`${pageStyles.section} ${styles.section1}`}>
      <div className={pageStyles.sectionHeader}>
        <span className={pageStyles.sectionNum}>02 · About</span>
        <h2 className={pageStyles.sectionTitle}>The shape of the trajectory</h2>
      </div>
      {mode === "leadership" ? (
        <>
          <p className={pageStyles.sectionLead}>
            Director identity established at Midwestern Interactive, where I
            led a 45-person agency engineering org through 6 to 8 team leads
            for 22 months. A follow-up Director seat at a B2B SaaS startup
            covered hiring, technical direction, and roadmap delivery at a
            ~10-engineer cross-functional team scope.
          </p>
          <p className={pageStyles.sectionBody}>
            Across both Director runs the pattern was the same: hire for the
            people I can lean on, codify recurring problems into tooling
            instead of policy docs, and build durable infrastructure. The
            ATS I stood up at Midwestern is still running there 4 years
            later.
          </p>
          <p className={pageStyles.sectionBody}>
            The 2023 to 2026 stretch went IC by circumstance, not direction.
            17 months embedded at Mailchimp via Tensure kept the keyboard
            chops sharp. Claude Code is the daily driver now.
          </p>
        </>
      ) : mode === "ic" ? (
        <>
          <p className={pageStyles.sectionLead}>
            17 months embedded as Senior FE at Mailchimp via Tensure
            consulting. Custom React / TypeScript SPA at public-platform
            scale. TypeScript SME on a JS-to-TS migration in the segmentation
            domain, component-tree restructuring and lazy-load work in the
            email editor.
          </p>
          <p className={pageStyles.sectionBody}>
            Before that, frontend performance work at Wayfair: 50ms
            first-paint improvement via Chrome DevTools flame-chart analysis,
            plus accessibility work as a member of the WCAG working group.
            Across 14 years total in software, the through-line is React /
            TypeScript depth and a tooling-first instinct that catches
            problems upstream instead of fighting them in code review.
          </p>
          <p className={pageStyles.sectionBody}>
            I&apos;ve also led FE engineering at Director scope (Midwestern,
            45-person agency org via 6 to 8 team leads, 22 months), so
            architectural judgment is in the kit alongside the keyboard
            work. Claude Code daily.
          </p>
        </>
      ) : (
        <>
          <p className={pageStyles.sectionLead}>
            Director identity established at Midwestern Interactive over 22
            months leading a 45-person agency org through 6 to 8 team leads,
            with a follow-up Director seat at a B2B SaaS startup.
          </p>
          <p className={pageStyles.sectionBody}>
            The 2023 to 2026 stretch went IC by circumstance, not direction.
            The 17-month Mailchimp engagement (via Tensure consulting) made
            the bridge useful: large-scale React and TypeScript work in an
            AI-progressive culture, no atrophy on the keyboard. Claude Code
            has been the daily driver since.
          </p>
        </>
      )}
    </section>
  );
}

/* ---------------- Quote ---------------- */

function QuoteSection({ mode }: { mode: Mode }) {
  const quote =
    mode === "ic"
      ? {
          text: "If the same PR change request keeps coming up across reviews, codify it as an ESLint rule. Let tooling be the bad guy, not the teammate.",
          attribution: "Engineering instinct",
        }
      : {
          text: "Hiring is about finding the people I can lean on. My job isn't to be the smartest in the room. It's to make sure the right expert is, and back their judgment.",
          attribution: "Hiring philosophy",
        };
  return (
    <section
      className={`${pageStyles.section} ${styles.section2}`}
      aria-label="Featured quote"
    >
      <div className={pageStyles.featuredQuote}>
        <p className={pageStyles.quoteText}>&ldquo;{quote.text}&rdquo;</p>
        <span className={pageStyles.quoteSource}>{quote.attribution}</span>
      </div>
    </section>
  );
}

/* ---------------- Stats ---------------- */

const STATS_BY_MODE: Record<Mode, Array<{ num: string; label: string }>> = {
  mixed: [
    { num: "14", label: "Years in software" },
    { num: "45", label: "Engineers led at the high-water mark" },
    { num: "~30", label: "Hires participated in" },
  ],
  leadership: [
    { num: "45", label: "Engineers led at the high-water mark" },
    { num: "6–8", label: "Team leads as direct reports" },
    { num: "~30", label: "Hires participated in" },
  ],
  ic: [
    { num: "14", label: "Years in software" },
    { num: "7", label: "Years of deep React and TypeScript" },
    { num: "50ms", label: "First-paint cut at Wayfair via flame-chart analysis" },
  ],
};

function StatsSection({ mode }: { mode: Mode }) {
  const stats = STATS_BY_MODE[mode];
  return (
    <section
      className={`${pageStyles.section} ${styles.section3}`}
      aria-label="Stats"
    >
      <div className={pageStyles.stats}>
        {stats.map((s) => (
          <div key={s.label} className={pageStyles.stat}>
            <span className={pageStyles.statNum}>{s.num}</span>
            <span className={pageStyles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Bee (universal) ---------------- */

function BeeSection() {
  return (
    <section className={`${pageStyles.section} ${styles.section4}`}>
      <div className={pageStyles.beeCallout}>
        <div className={pageStyles.beeIcon} aria-hidden>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a1208"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4 L18 4 L22 12 L18 20 L6 20 L2 12 Z" />
          </svg>
        </div>
        <div className={pageStyles.beeContent}>
          <strong>Outside the day job.</strong>
          <p>
            I run a small seasonal bee operation (Ozark Bee Barn) and
            productize grassroots beekeeper innovations for national retail.
            The Beetle Crusher and CombSafe Clip ship through Dadant &amp;
            Sons. Member-at-Large on the Missouri State Beekeepers
            Association board.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Stack (universal) ---------------- */

const TECH = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Mantine",
  "Anthropic Claude",
  "Upstash Redis",
  "Turnstile",
  "Vercel",
];

function StackSection() {
  return (
    <section className={`${pageStyles.section} ${styles.section5}`}>
      <div className={pageStyles.sectionHeader}>
        <span className={pageStyles.sectionNum}>03 · Stack</span>
        <h2 className={pageStyles.sectionTitle}>What this site is built on</h2>
      </div>
      <p className={pageStyles.sectionBody}>
        You&apos;re looking at it. RSC-by-default Next.js 16, Mantine for
        primitives, custom styling for everything that matters. The Fit Tool
        runs Anthropic&apos;s Haiku 4.5 as a classifier prepass and Sonnet
        4.6 for the eval, both with prompt caching. Identity state, the
        three-strike cooldown ladder, and the suspicious-input log all live
        in Upstash Redis. Cloudflare Turnstile gates anything that touches
        contact details or API calls. Hosted on Vercel.
      </p>
      <div className={pageStyles.techStrip}>
        {TECH.map((t) => (
          <span key={t} className={pageStyles.techPill}>
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}
