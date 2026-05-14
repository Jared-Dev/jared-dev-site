import { z } from "zod";

const serverSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  TURNSTILE_SECRET_KEY: z.string().min(1, "TURNSTILE_SECRET_KEY is required"),
  IP_HASH_SALT: z.string().min(32, "IP_HASH_SALT must be at least 32 chars"),
  /** Contact email revealed only via /api/contact-reveal after Turnstile success. */
  CONTACT_EMAIL: z.string().email().default("me@jareddev.com"),
  /** Contact phone revealed only via /api/contact-reveal after Turnstile success. */
  CONTACT_PHONE: z.string().min(7).default("417-434-0032"),
});

const publicSchema = z.object({
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1, "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required"),
  NEXT_PUBLIC_CALENDAR_URL: z.string().url().optional().or(z.literal("")),
});

type ServerEnv = z.infer<typeof serverSchema>;
type PublicEnv = z.infer<typeof publicSchema>;

let cachedServer: ServerEnv | undefined;
let cachedPublic: PublicEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Server environment is invalid:\n${issues}\n\nCheck .env.local against .env.example.`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_CALENDAR_URL: process.env.NEXT_PUBLIC_CALENDAR_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Public environment is invalid:\n${issues}\n\nCheck .env.local against .env.example.`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}
