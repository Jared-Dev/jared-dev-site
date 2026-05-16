"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
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
  const drawerId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pathnameSnapshot, setPathnameSnapshot] = useState(pathname);

  if (pathname !== pathnameSnapshot) {
    setPathnameSnapshot(pathname);
    setIsMenuOpen(false);
  }

  const handleToggle = useCallback(() => {
    setIsMenuOpen((open) => !open);
  }, []);

  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const visibleLinks = NAV_LINKS.filter(
    (link) => !link.recommendationGated || RECOMMENDATION_READY,
  );

  return (
    <>
      <header className={styles.nav}>
        <Link href="/" className={styles.brandLink} aria-label="Jared Malcolm, home">
          <span className={styles.brand}>
            <span className={styles.brandDot} aria-hidden />
            <span>Jared Malcolm</span>
          </span>
        </Link>
        <nav className={styles.navLinks} aria-label="Primary">
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href;
            const className = isActive
              ? `${styles.navLink} ${styles.navLinkActive}`
              : styles.navLink;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={className}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className={styles.menuButton}
          onClick={handleToggle}
          aria-expanded={isMenuOpen}
          aria-controls={drawerId}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        >
          <span className={styles.menuIcon} data-open={isMenuOpen}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </header>
      <div
        className={styles.backdrop}
        data-open={isMenuOpen}
        onClick={handleClose}
        aria-hidden
      />
      <aside
        id={drawerId}
        className={styles.drawer}
        data-open={isMenuOpen}
        aria-label="Mobile navigation"
        aria-hidden={!isMenuOpen}
      >
        <nav className={styles.drawerNav}>
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href;
            const className = isActive
              ? `${styles.drawerLink} ${styles.drawerLinkActive}`
              : styles.drawerLink;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={className}
                aria-current={isActive ? "page" : undefined}
                tabIndex={isMenuOpen ? 0 : -1}
                onClick={handleClose}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
