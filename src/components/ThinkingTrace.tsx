"use client";

import { useCallback, useId, useState } from "react";
import { TraceSource, type TraceStep } from "@/lib/fit-trace";
import styles from "./ThinkingTrace.module.css";

const SOURCE_LABEL: Record<TraceSource, string> = {
  [TraceSource.Web]: "Web",
  [TraceSource.Jev]: "Jev",
  [TraceSource.Claude]: "Claude",
  [TraceSource.Cache]: "Cache",
};

function formatDuration(ms: number): string {
  return ms < 1_000 ? "under a second" : `${(ms / 1_000).toFixed(1)}s`;
}

/** Distinct services that appear in the trace, in first-seen order. */
function sourcesUsed(steps: TraceStep[]): TraceSource[] {
  return [...new Set(steps.map((s) => s.source))];
}

export interface ThinkingTraceProps {
  steps: TraceStep[];
  /** The step still in flight. Rendered with a shimmer while live. */
  pending: TraceStep | null;
  /**
   * Null while the request is live (panel stays open, no toggle).
   * Set once the answer starts, collapsing the panel to a summary row.
   */
  durationMs: number | null;
}

export function ThinkingTrace({ steps, pending, durationMs }: ThinkingTraceProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const live = durationMs === null;

  const toggle = useCallback(() => {
    setOpen((o) => !o);
  }, []);

  if (steps.length === 0 && !pending) return null;

  const expanded = live || open;
  const allSteps = pending ? [...steps, pending] : steps;

  return (
    <div className={`${styles.root} ${live ? styles.live : ""}`}>
      {live ? (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>Thinking</span>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.summary} ${styles.summaryButton}`}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
        >
          <span className={styles.summaryLabel}>
            Thought for {formatDuration(durationMs)}
          </span>
          <span className={styles.summarySources}>
            {sourcesUsed(allSteps).map((s) => SOURCE_LABEL[s]).join(" · ")}
          </span>
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {expanded && (
        <ol id={listId} className={styles.steps} aria-live={live ? "polite" : undefined}>
          {steps.map((step, i) => (
            <TraceRow key={i} step={step} active={false} />
          ))}
          {pending && <TraceRow step={pending} active={live} />}
        </ol>
      )}
    </div>
  );
}

function TraceRow({ step, active }: { step: TraceStep; active: boolean }) {
  return (
    <li className={`${styles.step} ${active ? styles.stepActive : ""}`}>
      <span className={styles.dot} aria-hidden />
      <span className={`${styles.source} ${styles[`source_${step.source}`]}`}>
        {SOURCE_LABEL[step.source]}
      </span>
      <span className={`${styles.text} ${active ? styles.shimmer : ""}`}>
        {step.text}
      </span>
    </li>
  );
}
