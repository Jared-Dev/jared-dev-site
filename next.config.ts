import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Embedded PGlite powers local dev and tests only (db/index.ts imports it
  // lazily for pglite:// URLs). Keep it external and out of every
  // production function so it never costs bundle size or cold start.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/@electric-sql/pglite/**",
      // Turbopack's hashed alias for the external package.
      "./node_modules/@electric-sql/pglite-*",
      "./node_modules/.pnpm/@electric-sql+pglite@*/**",
    ],
  },
  // Dev-only: lets the iPhone on the LAN connect to HMR / dev resources
  // when hitting the Windows host by IP. Ignored by `next build`/`start`.
  allowedDevOrigins: ["192.168.1.69"],
};

export default nextConfig;
