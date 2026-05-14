import type { Metadata } from "next";
import { Timeline } from "@/components/Timeline";
import { RoleType } from "@/lib/timeline";
import styles from "./page.module.css";

type LegendVariant =
  | RoleType.Leadership
  | RoleType.Ic
  | RoleType.ContractIc
  | RoleType.NetworkAdmin;

export const metadata: Metadata = {
  title: "Timeline",
  description:
    "Jared Malcolm's career timeline: software engineering roles, leadership runs, contract stints, and a parallel track for the bee operation.",
  alternates: { canonical: "https://jareddev.com/timeline" },
};

export default function TimelinePage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <a href="/" className={styles.brandLink}>
            <span className={styles.brandDot} aria-hidden />
            <span>Jared Malcolm</span>
          </a>
        </div>
        <nav className={styles.navLinks}>
          <a className={styles.navLink} href="/">
            Home
          </a>
          <a className={styles.navLink} href="/contact">
            Contact
          </a>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>The traditional view</span>
          <h1 className={styles.heading}>Career timeline</h1>
          <p className={styles.lede}>
            The Fit Tool on the homepage delivers an honest read on whether
            you&apos;d hire him for the role you have in mind. This is the
            chronological scan recruiters reach for when they want to verify
            the picture themselves. Newest first.
          </p>
          <div className={styles.legendRow}>
            <Legend label="Leadership" variant={RoleType.Leadership} />
            <Legend label="IC" variant={RoleType.Ic} />
            <Legend label="Contract IC" variant={RoleType.ContractIc} />
            <Legend label="Network admin" variant={RoleType.NetworkAdmin} />
          </div>
        </section>

        <Timeline />

        <footer className={styles.foot}>
          <p>
            Anything that looks wrong? The bot on the homepage knows the
            longer story behind each entry; or reach out directly via{" "}
            <a href="/contact" className={styles.inlineLink}>
              /contact
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}

function Legend({
  label,
  variant,
}: {
  label: string;
  variant: LegendVariant;
}) {
  return (
    <span className={styles.legend}>
      <span
        className={`${styles.legendDot} ${styles[`legendDot_${variant}`]}`}
        aria-hidden
      />
      {label}
    </span>
  );
}
