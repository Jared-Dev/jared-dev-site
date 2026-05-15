import type { Metadata } from "next";
import { RecommendationGrid } from "@/components/RecommendationGrid";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Letters of recommendation",
  description:
    "What people who've worked directly with Jared have to say. Quotes pulled from full letters available on download.",
  alternates: { canonical: "https://jareddev.com/recommendation" },
};

export default function RecommendationPage() {
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
          <a className={styles.navLink} href="/timeline">
            Timeline
          </a>
          <a className={styles.navLink} href="/contact">
            Contact
          </a>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>Third-party context</span>
          <h1 className={styles.heading}>
            What people who&apos;ve worked with Jared say
          </h1>
          <p className={styles.lede}>
            Pulled quotes from people who&apos;ve managed Jared or worked
            directly with him.
          </p>
        </section>

        <RecommendationGrid />

        <footer className={styles.foot}>
          <p>
            Want the longer story behind any of these? The bot on the{" "}
            <a href="/" className={styles.inlineLink}>
              homepage
            </a>{" "}
            knows the full profile and can speak to specific roles. For a
            direct conversation, reach out via{" "}
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
