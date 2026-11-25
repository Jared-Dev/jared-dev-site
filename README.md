This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

This project uses [pnpm](https://pnpm.io) (version pinned in `package.json` under `packageManager`). Install dependencies, then run the development server:

```bash
pnpm install
pnpm dev
```

Installs only accept package versions published at least 14 days ago (`minimumReleaseAge` in `pnpm-workspace.yaml`). Packages that need install scripts must be approved under `allowBuilds` in the same file.

Call the Lighthouse script as `pnpm run audit`. Plain `pnpm audit` is pnpm's built-in vulnerability audit.

## Database

Postgres via Drizzle (`src/lib/db`), set up like HiveConf:

- `pnpm dev` runs on embedded PGlite (`.tmp/pglite-dev`, gitignored) and ignores `DATABASE_URL`, so local work never writes to the real database. `DEV_REMOTE_DB=1 pnpm dev` opts into the remote one. Tests use in-memory PGlite.
- Schema lives in `src/lib/db/schema.ts`. `pnpm db:generate` writes a migration to `drizzle/`; production builds on Vercel apply pending migrations before `next build` (`scripts/migrate-deploy.mjs`), and `pnpm lint` refuses non-additive migrations without a `-- reviewed:` marker.
- Runtime state (Fit Tool sessions and history, strikes and cooldowns, event and usage logs, response cache) is fail-open: if the database is unreachable, requests still succeed with that feature degraded.

## Brief and resume

`PROFILE_BRIEF.md` and `resume.pdf` are gitignored (this repo is public). Production reads them from Postgres, and every machine syncs them through the site:

```bash
pnpm run private:download          # pull both (new machine, or after editing elsewhere)
pnpm run private:upload            # push local edits; the pre-push hook runs this too
pnpm run private:upload -- resume  # just one file
```

Uploads go live within five minutes, no deploy. A gitignored `.private-sync.json` remembers what each machine last synced, git-style: an upload based on an older copy than the site has is refused (download, re-apply, upload), and a download won't overwrite local edits you haven't uploaded. `--force` overrides either. `--url http://localhost:3000` targets a local server.

Setting up another machine: copy `PRIVATE_UPLOAD_SECRET` from an existing `.env.local` (it must match Vercel), then `pnpm run private:download`.

## Environment

Beyond the existing keys: `DATABASE_URL` (Postgres), `PRIVATE_UPLOAD_SECRET` (upload endpoint; `openssl rand -base64 48`). The Turnstile gate cookie is signed with a key derived from `IP_HASH_SALT`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
