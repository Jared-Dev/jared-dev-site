"use client";

import { useState } from "react";
import {
  EDUCATION,
  PRE_SOFTWARE_TIMELINE,
  SIDE_TRACK,
  SOFTWARE_TIMELINE,
  endYear,
  formatDateRange,
  formatDuration,
  monthsBetween,
  startYear,
  type RoleType,
  type TimelineEntry,
} from "@/lib/timeline";
import styles from "./Timeline.module.css";

const DOT_CLASS_BY_TYPE: Record<RoleType, string> = {
  leadership: styles.dotLeadership!,
  "leadership-redacted": styles.dotLeadership!,
  "leadership-mismatch": styles.dotLeadership!,
  ic: styles.dotIc!,
  "contract-ic": styles.dotContractIc!,
  "network-admin": styles.dotNetworkAdmin!,
  "pre-software": styles.dotPreSoftware!,
};

const CARD_CLASS_BY_TYPE: Partial<Record<RoleType, string>> = {
  leadership: styles.cardLeadership!,
  "leadership-redacted": styles.cardLeadership!,
  "leadership-mismatch": styles.cardLeadership!,
};

function RoleCard({ entry }: { entry: TimelineEntry }) {
  const months = monthsBetween(entry.start, entry.end);
  const cardClass = CARD_CLASS_BY_TYPE[entry.roleType] ?? "";
  const sameYear = startYear(entry) === endYear(entry);
  return (
    <li className={styles.item}>
      <span className={styles.yearCol} aria-hidden>
        {sameYear ? endYear(entry) : `${startYear(entry)}–${endYear(entry).slice(-2)}`}
      </span>
      <span className={styles.dotCol} aria-hidden>
        <span className={`${styles.dot} ${DOT_CLASS_BY_TYPE[entry.roleType]}`} />
      </span>
      <article className={`${styles.card} ${cardClass}`}>
        <header className={styles.cardHeader}>
          <span className={styles.company}>
            {entry.company}
            {entry.redacted && (
              <span className={styles.redactedBadge} title="Company not named publicly">
                {" "}redacted
              </span>
            )}
          </span>
        </header>
        <p className={styles.title}>{entry.title}</p>
        <div className={styles.meta}>
          <span>{formatDateRange(entry.start, entry.end)}</span>
          <span className={styles.metaDot}>·</span>
          <span>{formatDuration(months)}</span>
        </div>
        {entry.summary && <p className={styles.summary}>{entry.summary}</p>}
        {entry.note && <p className={styles.note}>{entry.note}</p>}
      </article>
    </li>
  );
}

export function Timeline() {
  const [showPreSoftware, setShowPreSoftware] = useState(false);
  return (
    <div className={styles.wrap}>
      <div className={styles.eraHeading}>
        <span className={styles.eraNum}>01 · Software</span>
        <h2 className={styles.eraTitle}>Engineering work</h2>
      </div>
      <ol className={styles.list}>
        {SOFTWARE_TIMELINE.map((entry, i) => (
          <RoleCard key={`sw-${i}`} entry={entry} />
        ))}
      </ol>

      <button
        type="button"
        className={`${styles.expander} ${showPreSoftware ? styles.expanderOpen : ""}`}
        onClick={() => setShowPreSoftware((s) => !s)}
        aria-expanded={showPreSoftware}
      >
        {showPreSoftware
          ? "↑ Hide earlier (pre-software) work"
          : "↓ Show earlier (pre-software) work"}
      </button>

      {showPreSoftware && (
        <>
          <div className={styles.eraHeading}>
            <span className={styles.eraNum}>02 · Earlier</span>
            <h2 className={styles.eraTitle}>Before the switch to software</h2>
          </div>
          <ol className={styles.list}>
            {PRE_SOFTWARE_TIMELINE.map((entry, i) => (
              <RoleCard key={`pre-${i}`} entry={entry} />
            ))}
          </ol>
        </>
      )}

      <section className={styles.education} aria-label="Education">
        <div className={styles.eraHeading}>
          <span className={styles.eraNum}>03 · Education</span>
          <h2 className={styles.eraTitle}>Education</h2>
        </div>
        <ul className={styles.educationList}>
          {EDUCATION.map((entry, i) => (
            <li key={`edu-${i}`} className={styles.educationItem}>
              <div className={styles.educationHeader}>
                <span className={styles.educationCredential}>
                  {entry.credential}
                </span>
                <span className={styles.educationYear}>{entry.year}</span>
              </div>
              <p className={styles.educationInstitution}>{entry.institution}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.sideTrack} aria-label="Outside the day job">
        <div className={styles.eraHeading}>
          <span className={styles.eraNum}>04 · Parallel</span>
          <h2 className={styles.eraTitle}>Outside the day job</h2>
        </div>
        <ul className={styles.sideList}>
          {SIDE_TRACK.map((entry, i) => (
            <li key={`side-${i}`} className={styles.sideItem}>
              <div className={styles.sideLabel}>
                <span>{entry.label}</span>
                {entry.when && (
                  <span className={styles.sideWhen}>{entry.when}</span>
                )}
              </div>
              <p className={styles.sideDetail}>{entry.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
