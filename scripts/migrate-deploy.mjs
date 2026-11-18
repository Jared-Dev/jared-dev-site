// Deploy-time migration gate, run by the build script BEFORE `next build`
// so the schema is current before any new code (including build-time
// generateStaticParams) touches it.
//
// Rules:
//   - Local builds never migrate (dev applies migrations explicitly with
//     `pnpm db:migrate`; PGlite mode self-migrates in-process).
//   - On Vercel, production builds migrate automatically.
//   - Preview/staging builds migrate only when MIGRATE_ON_BUILD=1 is set on
//     that environment AND it has its own DATABASE_URL — a preview sharing
//     the production database must not push schema ahead of production code.
import { execSync } from "node:child_process";

const onVercel = Boolean(process.env.VERCEL);
const env = process.env.VERCEL_ENV; // "production" | "preview" | "development"
const url = process.env.DATABASE_URL ?? "";

const shouldMigrate =
  onVercel &&
  url !== "" &&
  !url.startsWith("pglite://") &&
  (env === "production" || process.env.MIGRATE_ON_BUILD === "1");

// A production build with no database is a misconfigured deploy, not a
// local convenience — fail loudly instead of shipping a site that 500s.
if (onVercel && env === "production" && (url === "" || url.startsWith("pglite://"))) {
  console.error(`[migrate-deploy] FATAL: production build without a postgres DATABASE_URL`);
  process.exit(1);
}

if (!shouldMigrate) {
  console.log(
    `[migrate-deploy] skipped (vercel=${onVercel}, env=${env ?? "-"}, ` +
      `db=${url ? "set" : "unset"}, MIGRATE_ON_BUILD=${process.env.MIGRATE_ON_BUILD ?? "-"})`
  );
  process.exit(0);
}

// drizzle-kit swallows connection errors behind its spinner (exit 1, no
// message). Preflight the connection ourselves so build logs say WHY —
// error message only, never the URL.
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const r = await client.query("select current_database() as db, current_user as usr");
  console.log(`[migrate-deploy] preflight ok: db=${r.rows[0].db} user=${r.rows[0].usr}`);
} catch (e) {
  console.error(`[migrate-deploy] FATAL: cannot connect to DATABASE_URL: ${e.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// Last line of defence: never apply a non-additive migration nobody signed
// off on (see scripts/check-migrations.mjs). CI runs the same check earlier.
try {
  execSync("node scripts/check-migrations.mjs", { stdio: "inherit" });
} catch {
  console.error("[migrate-deploy] FATAL: unreviewed risky migration — refusing to migrate");
  process.exit(1);
}

console.log(`[migrate-deploy] applying migrations (${env})…`);
execSync("pnpm exec drizzle-kit migrate", { stdio: "inherit" });
console.log("[migrate-deploy] done");
