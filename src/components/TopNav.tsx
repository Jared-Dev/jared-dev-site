"use client";

import { usePathname } from "next/navigation";
import { RECOMMENDATION_READY } from "@/lib/profile";
import styles from "./TopNav.module.css";

type NavLink = {
  href: string;
  label: string;
  recommendationGated?: boolean;
};

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/timeline", label: "Timeline" },
  { href: "/recommendation", label: "Recommendation", recommendationGated: true },
  { href: "/contact", label: "Contact" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className={styles.nav}>
      <a href="/" className={styles.brandLink} aria-label="Jared Malcolm, home">
        <span className={styles.brand}>
          <span className={styles.brandDot} aria-hidden />
          <span>Jared Malcolm</span>
        </span>
      </a>
      <nav className={styles.navLinks} aria-label="Primary">
        {NAV_LINKS.map((link) => {
          if (link.recommendationGated && !RECOMMENDATION_READY) return null;
          const isActive = pathname === link.href;
          const className = isActive
            ? `${styles.navLink} ${styles.navLinkActive}`
            : styles.navLink;
          return (
            <a
              key={link.href}
              href={link.href}
              className={className}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
    </header>
  );
}
