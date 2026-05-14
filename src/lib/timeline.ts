/**
 * Structured timeline data sourced from PROFILE_BRIEF.md.
 *
 * This is the source of truth for the /timeline page and any other
 * chronological renders. Keep entries in newest-first order so callers
 * don't have to re-sort. Updates here should mirror the brief; if they
 * diverge, the brief is canonical for the bot's eval and this file is
 * canonical for the rendered timeline.
 */

export type RoleType =
  | "leadership"
  | "leadership-redacted"
  | "leadership-mismatch"
  | "ic"
  | "contract-ic"
  | "network-admin"
  | "pre-software";

export interface TimelineEntry {
  company: string;
  title: string;
  /** YYYY-MM. */
  start: string;
  /** YYYY-MM or "present". */
  end: string | "present";
  roleType: RoleType;
  /** One-line summary in Jared's voice. */
  summary?: string;
  /** True if the company is intentionally generic (NDA / sensitive). */
  redacted?: boolean;
  /** Notes for the reader, e.g. structural caveats. */
  note?: string;
}

/**
 * Software / engineering roles. Newest first.
 * Note: the B2B SaaS Director seat is deliberately not named per the
 * brief's redaction policy.
 */
export const SOFTWARE_TIMELINE: TimelineEntry[] = [
  {
    company: "Mailchimp (via Tensure consulting)",
    title: "Senior Frontend Engineer · contract",
    start: "2024-10",
    end: "2026-03",
    roleType: "contract-ic",
    summary:
      "TypeScript SME on the segmentation team's JS-to-TS migration. Component-tree restructuring and lazy-load performance work in the email editor. Cursor as daily driver across a large React/TS SPA.",
  },
  {
    company: "ProX",
    title: "Head of Engineering",
    start: "2024-04",
    end: "2024-07",
    roleType: "leadership-mismatch",
    summary:
      "Short tenure where the title and the day-to-day diverged. The engineering work was being executed by an external dev firm; the role had the title without the levers. Departed amicably.",
    note:
      "Useful clarifier for what I'm looking for next: lead internal engineering teams, contractors as one input rather than the whole job.",
  },
  {
    company: "GDH",
    title: "Software Engineer · contract",
    start: "2023-06",
    end: "2024-04",
    roleType: "contract-ic",
    summary:
      "Built and maintained an internal asset-tracking application. Kept linters and dev tooling well-tuned to catch issues upstream; introduced reusable design patterns for maintainability.",
  },
  {
    company: "B2B SaaS startup · industrial operations",
    title: "Director of Engineering",
    start: "2022-09",
    end: "2023-04",
    roleType: "leadership-redacted",
    redacted: true,
    summary:
      "Led a ~10-engineer cross-functional team. Reports were initially to the CTO, then directly to the CEO after a leadership change. Shipped customer-facing self-serve user management (replaced an email-to-sales-rep workflow). Led the data-layer migration to an ORM.",
    note:
      "Role ended via layoff during a leadership shuffle at the company. Happy to share context directly.",
  },
  {
    company: "Midwestern Interactive",
    title: "Director of Engineering",
    start: "2020-11",
    end: "2022-08",
    roleType: "leadership",
    summary:
      "Led a ~45-person agency engineering org through 6 to 8 team leads. Performance management across the org, hiring at volume in partnership with the VP of Engineering. Owned the frontend technical authority across all client engagements. The ATS I stood up here is still running four years later.",
  },
  {
    company: "RichContext",
    title: "Senior Software Engineer II",
    start: "2020-10",
    end: "2020-11",
    roleType: "ic",
    summary:
      "Brief stint. React context refactoring work to reduce unnecessary re-renders.",
  },
  {
    company: "Wayfair",
    title: "Frontend Engineer II · Performance Team",
    start: "2019-08",
    end: "2020-09",
    roleType: "ic",
    summary:
      "50ms first-paint improvement on Wayfair.com via flame-chart analysis. Member of Wayfair's WCAG / accessibility working group. Built custom performance-monitoring dashboards for the team.",
  },
  {
    company: "Gigsalad",
    title: "Senior Software Engineer",
    start: "2018-05",
    end: "2019-08",
    roleType: "ic",
    summary:
      "Remote, ~95% frontend. Standardized React conventions; introduced TypeScript and automated testing to the codebase. Restructured component architecture toward deletability as a design principle.",
  },
  {
    company: "ADevsCo",
    title: "Lead Developer",
    start: "2017-12",
    end: "2018-04",
    roleType: "leadership",
    summary:
      "Led client projects on a C#/ASP.NET Core + React/Bootstrap stack. Direct client interaction, requirements gathering, contractor coordination.",
  },
  {
    company: "Midwestern Interactive",
    title: "Senior Developer",
    start: "2017-01",
    end: "2017-12",
    roleType: "ic",
    summary:
      "First stint at Midwestern. Mentored juniors, established web best practices for marketing-site work, did database optimization (replaced a slow multi-join query path with materialized views, cutting query duration from ~30s to under 1s).",
    note:
      "Tenure ended during a workforce reduction tied to a major business contraction at the company. Midwestern brought me back as Director three years later.",
  },
  {
    company: "R&R Solutions",
    title: "Lead Web Developer",
    start: "2016-10",
    end: "2017-01",
    roleType: "leadership",
    summary:
      "Led a small dev team under the Programming Manager. Code reviews, internal requirements gathering for a corporate database.",
  },
  {
    company: "Leggett & Platt",
    title: "Web Developer II",
    start: "2015-01",
    end: "2016-09",
    roleType: "ic",
    summary:
      "Two-year stint at a publicly-traded manufacturer. Initial move to a CSS preprocessor (Sass), enabled bundling and minification across new projects to cut page load times. Designed a mobile navigation pattern reused across new builds; built a universal footer for cross-brand cohesion.",
  },
  {
    company: "EFCO (a Pella company)",
    title: "Network Administrator",
    start: "2013-01",
    end: "2015-01",
    roleType: "network-admin",
    summary:
      "Two years in network infrastructure. Cisco ASA + Meraki MX firewalls, Nexus 5548 switch upgrades, Infinias Intelli-M access control. Left because the on-call had no rotation; would consider on-call again at a larger org with a real rotation.",
  },
  {
    company: "Tri-State Motor Company",
    title: "Programmer",
    start: "2011-09",
    end: "2012-12",
    roleType: "ic",
    summary:
      "First software engineering role at scale. Rebuilt the driver-recruiting application flow, stripping unnecessary intake fields and adding analytics to find drop-off points. 2-3x increase in completed applications year-over-year.",
  },
  {
    company: "Onshore Technology Services",
    title: "Software Engineer",
    start: "2011-01",
    end: "2011-09",
    roleType: "ic",
    summary:
      "Java EE maintenance work on a trucking-industry cost-accounting system. First professional dev role.",
  },
];

/**
 * Pre-software work (early career, before transitioning into engineering).
 * Surfaced behind an expander on the timeline page so the chronological
 * scan stays focused on software roles by default.
 */
export const PRE_SOFTWARE_TIMELINE: TimelineEntry[] = [
  {
    company: "AT&T Mobility",
    title: "Customer Service Representative (sales-focused)",
    start: "2005-01",
    end: "2010-12",
    roleType: "pre-software",
    summary:
      "Floor lead for most of the run. Made the deliberate switch to software dev after coming to terms with my dad's career being a pretty good one.",
  },
  {
    company: "Great Barrier Reef (dial-up ISP)",
    title: "Technical Support",
    start: "2002-01",
    end: "2003-12",
    roleType: "pre-software",
    summary: "First paid job in tech-adjacent work.",
  },
];

/**
 * Education entries. Kept short; the work history carries the weight.
 */
export interface EducationEntry {
  institution: string;
  credential: string;
  year: string;
}

export const EDUCATION: EducationEntry[] = [
  {
    institution: "Missouri Southern State University",
    credential: "Associate of Science, Computer Information Systems",
    year: "2012",
  },
];

/**
 * Parallel track: bee operation and community leadership outside the
 * day job. Not strictly chronological because the operation has been
 * running concurrently with everything since launch.
 */
export interface SideTrackEntry {
  label: string;
  detail: string;
  /** Optional date qualifier shown in the corner. */
  when?: string;
}

export const SIDE_TRACK: SideTrackEntry[] = [
  {
    label: "Ozark Bee Barn",
    detail:
      "Small seasonal bee operation. Queen rearing, nuc sales, retail packaging of grassroots beekeeping innovations.",
    when: "ongoing",
  },
  {
    label: "Beetle Crusher",
    detail:
      "Productized small-hive-beetle pest control device. National retail distribution through Dadant & Sons. Injection-mold scale-up shipping end of May 2026.",
    when: "2024 → present",
  },
  {
    label: "CombSafe Clip",
    detail:
      "Productized Varroa-mite treatment alignment clip. 3D-printed, retail.",
    when: "ongoing",
  },
  {
    label: "MSBA board",
    detail:
      "Member-at-Large on the Missouri State Beekeepers Association board.",
    when: "ongoing",
  },
  {
    label: "Local beekeeping club",
    detail: "President.",
    when: "ongoing",
  },
];

/* ---------------- Formatting helpers ---------------- */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const monthIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MONTH_NAMES[monthIdx]} ${y}`;
}

export function formatDateRange(start: string, end: string | "present"): string {
  const startStr = formatMonth(start);
  const endStr = end === "present" ? "Present" : formatMonth(end);
  return `${startStr} – ${endStr}`;
}

export function monthsBetween(
  start: string,
  end: string | "present",
): number {
  const [sy, sm] = start.split("-").map(Number);
  const e =
    end === "present"
      ? new Date()
      : (() => {
          const [ey, em] = end.split("-").map(Number);
          return new Date(ey!, em! - 1);
        })();
  const startDate = new Date(sy!, sm! - 1);
  return Math.max(
    1,
    (e.getFullYear() - startDate.getFullYear()) * 12 +
      (e.getMonth() - startDate.getMonth()),
  );
}

export function formatDuration(months: number): string {
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? "1 yr" : `${years} yrs`;
  return `${years} yr ${rem} mo`;
}

export function startYear(entry: TimelineEntry): string {
  return entry.start.split("-")[0]!;
}

export function endYear(entry: TimelineEntry): string {
  return entry.end === "present"
    ? String(new Date().getFullYear())
    : entry.end.split("-")[0]!;
}
