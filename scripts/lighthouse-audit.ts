/**
 * Lighthouse audit runner for jareddev.com (or any URL passed in).
 *
 * Runs the desktop and mobile presets, summarizes Core Web Vitals and
 * category scores, and lists any non-passing audits worth attention.
 * Writes the full JSON reports to the project root (gitignored via
 * lighthouse-*.json) so they can be opened in the Lighthouse viewer
 * for deep dives.
 *
 * Usage:
 *   npm run audit                          # audits https://jareddev.com
 *   npm run audit -- https://staging.url   # audits a different URL
 *   npm run audit -- --desktop-only        # skip the mobile pass
 *   npm run audit -- --mobile-only         # skip the desktop pass
 *
 * Requires Chrome to be installed locally. On Windows / macOS / Linux,
 * lighthouse + chrome-launcher will discover the installed Chrome
 * automatically.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "https://jareddev.com";

interface Args {
  url: string;
  runDesktop: boolean;
  runMobile: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  let url = DEFAULT_URL;
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      flags.add(arg);
    } else if (arg.startsWith("http")) {
      url = arg;
    }
  }
  const desktopOnly = flags.has("--desktop-only");
  const mobileOnly = flags.has("--mobile-only");
  if (desktopOnly && mobileOnly) {
    console.error("Pick one of --desktop-only or --mobile-only, not both.");
    process.exit(1);
  }
  return {
    url,
    runDesktop: !mobileOnly,
    runMobile: !desktopOnly,
  };
}

/** Lighthouse's category and audit shape, narrowed to the bits we read. */
interface LhCategory {
  score: number | null;
}
interface LhAudit {
  id: string;
  title: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
}
interface LhResult {
  categories: {
    performance: LhCategory;
    accessibility: LhCategory;
    "best-practices": LhCategory;
    seo: LhCategory;
  };
  audits: Record<string, LhAudit>;
}

async function runPreset(
  url: string,
  preset: "desktop" | "mobile",
): Promise<LhResult> {
  // Lighthouse is ESM-only and pulls chrome-launcher transitively. We
  // import it dynamically so this script can stay top-level CommonJS-
  // friendly when tsx is invoked.
  const { default: lighthouse } = await import("lighthouse");
  const chromeLauncher = await import("chrome-launcher");

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });

  try {
    const flags = {
      port: chrome.port,
      output: "json" as const,
      logLevel: "error" as const,
    };
    const config =
      preset === "desktop"
        ? ({
            extends: "lighthouse:default",
            settings: {
              formFactor: "desktop" as const,
              screenEmulation: {
                mobile: false,
                width: 1350,
                height: 940,
                deviceScaleFactor: 1,
                disabled: false,
              },
              throttling: {
                rttMs: 40,
                throughputKbps: 10240,
                cpuSlowdownMultiplier: 1,
                requestLatencyMs: 0,
                downloadThroughputKbps: 0,
                uploadThroughputKbps: 0,
              },
            },
          } as const)
        : undefined;

    const runner = await lighthouse(url, flags, config);
    if (!runner) {
      throw new Error("Lighthouse returned no result.");
    }
    return runner.lhr as unknown as LhResult;
  } finally {
    // chrome-launcher's tmp-dir cleanup occasionally throws EPERM on
    // Windows (file lock held by the just-exiting chrome process).
    // The audit data is already captured by this point; swallowing the
    // cleanup error so the report still gets written.
    try {
      await chrome.kill();
    } catch (cleanupErr) {
      console.warn("[lighthouse] chrome.kill() cleanup failed:", cleanupErr);
    }
  }
}

function pct(score: number | null): string {
  if (score === null) return " n/a";
  return String(Math.round(score * 100)).padStart(3, " ");
}

function summarize(label: string, result: LhResult): void {
  const c = result.categories;
  const a = result.audits;

  console.log(`\n=== ${label} ===`);
  console.log(`  Performance:    ${pct(c.performance.score)}`);
  console.log(`  Accessibility:  ${pct(c.accessibility.score)}`);
  console.log(`  Best Practices: ${pct(c["best-practices"].score)}`);
  console.log(`  SEO:            ${pct(c.seo.score)}`);

  console.log(`\n  Core Web Vitals`);
  for (const id of [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
  ]) {
    const audit = a[id];
    if (audit?.displayValue) {
      console.log(`    ${audit.title.padEnd(28)} ${audit.displayValue}`);
    }
  }

  const failing = Object.values(a).filter(
    (x) =>
      x.score !== null &&
      x.score < 0.9 &&
      x.scoreDisplayMode !== "notApplicable" &&
      x.scoreDisplayMode !== "informative" &&
      x.scoreDisplayMode !== "manual",
  );
  if (failing.length > 0) {
    console.log(`\n  Audits below 90`);
    for (const audit of failing) {
      const score = Math.round((audit.score ?? 0) * 100);
      console.log(`    [${String(score).padStart(3)}] ${audit.id}: ${audit.title}`);
    }
  }
}

async function main(): Promise<void> {
  const { url, runDesktop, runMobile } = parseArgs(process.argv.slice(2));

  console.log(`Lighthouse audit -> ${url}`);

  if (runDesktop) {
    console.log("\nRunning desktop preset...");
    const result = await runPreset(url, "desktop");
    const outPath = join(process.cwd(), "lighthouse-desktop.json");
    writeFileSync(outPath, JSON.stringify(result));
    summarize("Desktop", result);
    console.log(`  Report written to ${outPath}`);
  }

  if (runMobile) {
    console.log("\nRunning mobile preset...");
    const result = await runPreset(url, "mobile");
    const outPath = join(process.cwd(), "lighthouse-mobile.json");
    writeFileSync(outPath, JSON.stringify(result));
    summarize("Mobile", result);
    console.log(`  Report written to ${outPath}`);
  }
}

main().catch((err: unknown) => {
  console.error("Lighthouse audit failed:", err);
  process.exit(1);
});
