import Image from "next/image";
import { AdaptiveHome } from "@/components/AdaptiveHome";
import { HeroBackground } from "@/components/HeroBackground";
import { RECOMMENDATION_READY } from "@/lib/profile";
import styles from "./page.module.css";

const PERSON_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Jared Malcolm",
  url: "https://jareddev.com",
  jobTitle: "Software Engineering Leader, Frontend Focus",
  description:
    "14 years in software, frontend-focused with full-stack background. AI tooling is the daily driver, not a learning curve. Open to engineering leadership or senior IC roles at companies he'd choose to be at. Remote-first from Joplin, MO. Available now.",
  address: {
    "@type": "PostalAddress",
    addressRegion: "MO",
    addressCountry: "US",
  },
  knowsAbout: [
    "Frontend engineering leadership",
    "Next.js",
    "React",
    "TypeScript",
    "AI integration",
    "Engineering management",
    "Engineering hiring",
  ],
};

export default function HomePage() {
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(PERSON_JSON_LD).replace(/</g, "\\u003c"),
        }}
      />

      <section className={styles.hero}>
        <HeroBackground />
        <div className={styles.heroInner}>
          <div className={styles.heroLayoutCompact}>
            <div className={styles.heroContentCompact}>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden />
                Available now · Joplin, MO · Central Time
              </div>

              <h1 className={styles.headlineCompact}>
                14 years in software, frontend-focused.{" "}
                <span className={styles.headlineAccent}>
                  Leadership or senior IC.
                </span>
              </h1>

              <p className={styles.subhead}>
                Full-stack background, FE depth. AI tooling is the daily
                driver, not a learning curve. Remote-first.
              </p>

              <p className={styles.ctaContext}>
                Paste a JD or drop a job-board URL below. The bot returns
                an honest read: what fits, what doesn&apos;t, and
                what&apos;s worth a direct conversation.
              </p>

              <div className={styles.ctaRowCompact}>
                <a className={`${styles.btn} ${styles.btnPrimary}`} href="#fit">
                  Try the Fit Tool ↓
                </a>
                <a
                  className={`${styles.btn} ${styles.btnGhost}`}
                  href="/contact"
                >
                  Contact
                </a>
              </div>
            </div>

            <div className={styles.heroPortraitCompact}>
              <Image
                src="/jared.jpg"
                alt="Jared Malcolm"
                width={720}
                height={720}
                priority
                sizes="(max-width: 768px) 140px, 180px"
              />
            </div>
          </div>
        </div>
      </section>

      <main className={styles.adaptiveWrap}>
        <AdaptiveHome />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerMeta}>
            © {new Date().getFullYear()} Jared Malcolm
          </div>
          <div className={styles.footerLinks}>
            <a className={styles.footerLink} href="/timeline">
              Timeline
            </a>
            <a className={styles.footerLink} href="/contact">
              Contact
            </a>
            {RECOMMENDATION_READY && (
              <a className={styles.footerLink} href="/recommendation">
                Recommendation
              </a>
            )}
            <a
              className={styles.footerLink}
              href="https://github.com/Jared-Dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub ↗
            </a>
            <a
              className={styles.footerLink}
              href="https://www.linkedin.com/in/jaredmalcolm"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
