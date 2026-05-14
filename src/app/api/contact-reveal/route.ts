import { z } from "zod";
import { clientIp } from "@/lib/identity";
import { serverEnv } from "@/lib/env";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  turnstileToken: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const { turnstileToken } = parsed.data;
  const ip = clientIp(req);

  const ok = await verifyTurnstile(turnstileToken, ip);
  if (!ok) {
    return jsonResponse(
      { error: "Verification failed. Refresh and try again." },
      401,
    );
  }

  const env = serverEnv();
  return jsonResponse({
    email: env.CONTACT_EMAIL,
    phone: env.CONTACT_PHONE,
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
