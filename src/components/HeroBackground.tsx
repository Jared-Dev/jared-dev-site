import styles from "./HeroBackground.module.css";

/**
 * Layered animated hero background. Three soft, drifting gradient blobs +
 * a subtle honeycomb pattern (bee-identity tie-in) + film grain + bottom
 * vignette that hands off cleanly to the page bg.
 *
 * Pure CSS. No JS, no animation libs. Respects prefers-reduced-motion
 * via the global stylesheet. Cheap and Lighthouse-friendly.
 */
export function HeroBackground() {
  return (
    <div className={styles.wrap} aria-hidden>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />
      <div className={styles.combs} />
      <div className={styles.grain} />
      <div className={styles.vignette} />
    </div>
  );
}
