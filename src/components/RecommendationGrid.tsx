"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RoleFlavor } from "@/components/FitTool";
import { Turnstile } from "@/components/Turnstile";
import {
  lettersByRecency,
  selectQuotesForLetter,
  type Letter,
  type Quote,
} from "@/lib/recommendations";
import styles from "./RecommendationGrid.module.css";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "dev-bypass";
const USE_BYPASS = TURNSTILE_SITE_KEY === "dev-bypass";

const ROLE_FLAVOR_VALUES = new Set<string>(Object.values(RoleFlavor));

interface ContactsResponse {
  ok: boolean;
  contacts?: ContactInfo[];
  reason?: string;
}

interface ContactInfo {
  id: string;
  phone: string;
  callsWelcomeText: string;
}

function resolveFlavorFromUrl(): RoleFlavor | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("flavor");
  if (!param) return null;
  const lower = param.toLowerCase();
  return ROLE_FLAVOR_VALUES.has(lower) ? (lower as RoleFlavor) : null;
}

function resolveFlavorFromStorage(): RoleFlavor | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("jaredFlavor");
  if (!raw) return null;
  return ROLE_FLAVOR_VALUES.has(raw) ? (raw as RoleFlavor) : null;
}

/**
 * Programmatic download: synthesize an anchor with `download` so the
 * browser saves the PDF instead of navigating to it.
 */
function triggerDownload(pdfPath: string): void {
  const anchor = document.createElement("a");
  anchor.href = pdfPath;
  anchor.download = "";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D+/g, "");
}

enum VerifyStatus {
  Idle = "idle",
  Verifying = "verifying",
  Error = "error",
}

export function RecommendationGrid() {
  const letters = useMemo(() => lettersByRecency(), []);

  const [mounted, setMounted] = useState(false);
  const [flavor, setFlavor] = useState<RoleFlavor | null>(null);
  const [sessionVerified, setSessionVerified] = useState(USE_BYPASS);
  const [contacts, setContacts] = useState<ContactInfo[] | null>(null);

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(
    VerifyStatus.Idle,
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [pendingPdfPath, setPendingPdfPath] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [widgetMounted, setWidgetMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFlavor(resolveFlavorFromUrl() ?? resolveFlavorFromStorage());
    const localFlag =
      USE_BYPASS ||
      window.localStorage.getItem("jaredSessionVerified") === "true";
    setSessionVerified(localFlag);

    // If localStorage says we're verified, try fetching contacts. The
    // server-side cookie is the actual gate; localStorage is only a
    // hint. If the cookie is missing or expired, the endpoint returns
    // 401 and we silently fall back to "click download to verify".
    if (localFlag) {
      void (async () => {
        try {
          const res = await fetch("/api/recommendation/contacts", {
            credentials: "same-origin",
          });
          if (!res.ok) return;
          const data = (await res.json()) as ContactsResponse;
          if (data.ok && data.contacts) setContacts(data.contacts);
        } catch {
          // Network failure on contacts is non-fatal; downloads still work.
        }
      })();
    }
  }, []);

  const handleDownloadRequest = useCallback(
    (pdfPath: string) => {
      if (sessionVerified && contacts !== null) {
        triggerDownload(pdfPath);
        return;
      }
      if (sessionVerified && contacts === null) {
        // localStorage flag was set but server-side cookie is gone
        // (expired or never minted on this browser). Re-verify so we
        // can also hydrate the contacts line.
        setSessionVerified(false);
      }
      setPendingPdfPath(pdfPath);
      setWidgetMounted(true);
      setVerifyStatus(VerifyStatus.Verifying);
      setVerifyError(null);
    },
    [sessionVerified, contacts],
  );

  const pendingPdfPathRef = useRef<string | null>(null);
  useEffect(() => {
    pendingPdfPathRef.current = pendingPdfPath;
  }, [pendingPdfPath]);

  const handleTurnstileVerify = useCallback(async (token: string) => {
    setVerifyError(null);
    let data: ContactsResponse | null = null;
    try {
      const res = await fetch("/api/recommendation/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ turnstileToken: token }),
      });
      data = (await res.json().catch(() => null)) as ContactsResponse | null;
      if (!res.ok || !data?.ok) {
        setVerifyStatus(VerifyStatus.Error);
        setVerifyError(
          data?.reason ?? "Verification failed. Refresh and try again.",
        );
        setTurnstileResetKey((k) => k + 1);
        return;
      }
    } catch (err) {
      setVerifyStatus(VerifyStatus.Error);
      setVerifyError(
        `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      );
      setTurnstileResetKey((k) => k + 1);
      return;
    }

    window.localStorage.setItem("jaredSessionVerified", "true");
    setSessionVerified(true);
    if (data?.contacts) setContacts(data.contacts);
    setVerifyStatus(VerifyStatus.Idle);
    const pdfPath = pendingPdfPathRef.current;
    if (pdfPath) {
      triggerDownload(pdfPath);
      setPendingPdfPath(null);
    }
  }, []);

  const handleTurnstileError = useCallback(() => {
    setVerifyStatus(VerifyStatus.Error);
    setVerifyError("Verification widget hit an error. Refresh and try again.");
  }, []);

  const handleVerifyDismiss = useCallback(() => {
    setVerifyStatus(VerifyStatus.Idle);
    setVerifyError(null);
    setPendingPdfPath(null);
  }, []);

  const contactsById = useMemo(() => {
    const map = new Map<string, ContactInfo>();
    if (contacts) for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.stack}>
        {letters.map((letter) => (
          <LetterCard
            key={letter.id}
            letter={letter}
            quotes={selectQuotesForLetter(letter, mounted ? flavor : null)}
            contact={contactsById.get(letter.id) ?? null}
            onRequestDownload={handleDownloadRequest}
            isPending={pendingPdfPath === letter.pdfPath}
          />
        ))}
      </div>

      {widgetMounted && !sessionVerified && (
        <div className={styles.verifyChip} role="status">
          <div className={styles.verifyText}>
            {verifyStatus === VerifyStatus.Error
              ? (verifyError ?? "Verification failed.")
              : "Quick check that you're human, then the letter will download."}
          </div>
          <div className={styles.verifyWidget}>
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onVerify={handleTurnstileVerify}
              onError={handleTurnstileError}
              resetKey={turnstileResetKey}
            />
          </div>
          <button
            type="button"
            className={styles.verifyDismiss}
            onClick={handleVerifyDismiss}
            aria-label="Dismiss verification"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function LetterCard({
  letter,
  quotes,
  contact,
  onRequestDownload,
  isPending,
}: {
  letter: Letter;
  quotes: readonly Quote[];
  contact: ContactInfo | null;
  onRequestDownload: (pdfPath: string) => void;
  isPending: boolean;
}) {
  const handleClick = () => {
    onRequestDownload(letter.pdfPath);
  };
  const heroQuote = quotes[0];
  return (
    <article className={styles.entry}>
      <header className={styles.bylineHeader}>
        {letter.photoPath ? (
          <Image
            src={letter.photoPath}
            alt={`${letter.recommenderName} portrait`}
            width={128}
            height={128}
            className={styles.avatar}
          />
        ) : (
          <div className={styles.avatarFallback} aria-hidden>
            {initialsFor(letter.recommenderName)}
          </div>
        )}
        <div className={styles.bylineText}>
          <p className={styles.bylineName}>{letter.recommenderName}</p>
          <p className={styles.bylineTitle}>
            {letter.recommenderTitle} · {letter.recommenderCompany}
          </p>
          <p className={styles.bylineRelationship}>{letter.relationship}</p>
        </div>
      </header>

      {heroQuote && (
        <blockquote className={styles.heroQuote}>
          <span className={styles.heroQuoteMark} aria-hidden>
            &ldquo;
          </span>
          <p className={styles.heroQuoteText}>{heroQuote.text}</p>
        </blockquote>
      )}

      <footer className={styles.entryFooter}>
        {contact && (
          <p className={styles.contactLine}>
            {firstName(letter.recommenderName)} {contact.callsWelcomeText}{" "}
            <a
              href={`tel:${digitsOnly(contact.phone)}`}
              className={styles.contactPhone}
            >
              {contact.phone}
            </a>
          </p>
        )}
        <button
          type="button"
          className={styles.cta}
          onClick={handleClick}
          disabled={isPending}
        >
          {isPending
            ? "Verifying…"
            : `Read more from ${firstName(letter.recommenderName)}`}
          {!isPending && (
            <span className={styles.ctaArrow} aria-hidden>
              ↓
            </span>
          )}
        </button>
      </footer>
    </article>
  );
}
