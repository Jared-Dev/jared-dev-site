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
};

export default nextConfig;
