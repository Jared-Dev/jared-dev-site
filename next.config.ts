import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure PROFILE_BRIEF.md is bundled with the /api/fit serverless function.
  // The bot's system prompt reads the brief at runtime; Vercel's tracer
  // doesn't statically see fs.readFileSync(process.cwd() + "/PROFILE_BRIEF.md")
  // so we declare the include explicitly.
  outputFileTracingIncludes: {
    "/api/fit": ["./PROFILE_BRIEF.md"],
    "/api/contact-reveal": ["./PROFILE_BRIEF.md"],
  },
  // Dev-only: lets the iPhone on the LAN connect to HMR / dev resources
  // when hitting the Windows host by IP. Ignored by `next build`/`start`.
  allowedDevOrigins: ["192.168.1.69"],
};

export default nextConfig;
