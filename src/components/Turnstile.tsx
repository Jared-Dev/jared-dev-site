"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
          size?: "normal" | "compact" | "flexible";
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  /**
   * Increment this value to force the widget to issue a new token. Cloudflare
   * Turnstile tokens are single-use, so the parent should bump resetKey after
   * each successful server-side verification to keep the form able to submit
   * again.
   */
  resetKey?: number;
}

export function Turnstile({
  siteKey,
  onVerify,
  onError,
  onExpire,
  resetKey = 0,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);
  const lastResetKeyRef = useRef(resetKey);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let cancelled = false;

    function tryRender() {
      if (cancelled) return;
      if (!window.turnstile || !containerRef.current) {
        requestAnimationFrame(tryRender);
        return;
      }
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onVerifyRef.current(token),
        "error-callback": () => onErrorRef.current?.(),
        "expired-callback": () => onExpireRef.current?.(),
        appearance: "always",
        size: "flexible",
        theme: "auto",
      });
    }

    tryRender();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // Reset the widget when the parent bumps resetKey so a new token is issued.
  useEffect(() => {
    if (resetKey === lastResetKeyRef.current) return;
    lastResetKeyRef.current = resetKey;
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore
      }
    }
  }, [resetKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
    </>
  );
}
