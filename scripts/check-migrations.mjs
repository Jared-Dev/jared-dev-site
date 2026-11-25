#!/usr/bin/env node
// Migration guardrail. `pnpm build` applies pending drizzle migrations to
// production automatically (scripts/migrate-deploy.mjs), so a committed
// migration IS a production migration. Anything that isn't purely additive
// must be explicitly signed off by a human before it can ship.
//
// A migration is "risky" if it contains any of:
//   DROP …, RENAME, ALTER COLUMN … TYPE / SET DATA TYPE, SET NOT NULL,
//   UPDATE, DELETE, TRUNCATE
// Such a file must carry a marker line:
//   -- reviewed: <name> <YYYY-MM-DD> — <why it's safe / what was weighed>
// The marker is the approval; add it only after reading the SQL.
//
// Usage: node scripts/check-migrations.mjs [dir]   (exit 1 on violations)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RISKY = [
  { re: /\bdrop\s+(table|column|index|constraint|type|schema|view|sequence)\b/i, label: "DROP" },
  { re: /\brename\s+(to|column)\b/i, label: "RENAME" },
  { re: /\balter\s+column\b[^;]*\b(set\s+data\s+)?type\b/i, label: "column type change" },
  { re: /\bset\s+not\s+null\b/i, label: "SET NOT NULL" },
  // UPDATE "t" SET …  /  UPDATE "t" e SET …  /  UPDATE "t" AS e SET …
  { re: /^\s*update\s+\S+(\s+(as\s+)?[a-z_]\w*)?\s+set\b/im, label: "UPDATE" },
  { re: /^\s*delete\s+from\b/im, label: "DELETE" },
  { re: /\btruncate\b/i, label: "TRUNCATE" },
];

const REVIEWED = /^--[ \t]*reviewed:[ \t]*\S.*$/m;

// Strip SQL comments so a risky keyword inside an explanation doesn't trip
// the check, but keep the marker line itself out of the stripped text.
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function checkMigration(sql) {
  const body = stripComments(sql);
  const hits = RISKY.filter((r) => r.re.test(body)).map((r) => r.label);
  const reviewed = REVIEWED.test(sql);
  return { hits, reviewed, ok: hits.length === 0 || reviewed };
}

export function checkDir(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return files.map((file) => ({ file, ...checkMigration(readFileSync(join(dir, file), "utf8")) }));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, "/"));
if (isMain) {
  const dir = process.argv[2] ?? "drizzle";
  const results = checkDir(dir);
  const bad = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.hits.length === 0) continue;
    console.log(`${r.ok ? "reviewed" : "UNREVIEWED"}  ${r.file}: ${r.hits.join(", ")}`);
  }
  if (bad.length) {
    console.error(
      `\n[check-migrations] ${bad.length} migration(s) contain non-additive SQL without a review marker.\n` +
        `Read the SQL, weigh the options, then add a line like:\n` +
        `  -- reviewed: <name> <YYYY-MM-DD> — <why this is safe for existing data>\n`
    );
    process.exit(1);
  }
  console.log(`[check-migrations] ${results.length} migration(s) ok`);
}
