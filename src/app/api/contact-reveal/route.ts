import { z } from "zod";
import { passGate } from "@/lib/verified-visitor";

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

  // Also mints the verified-visitor cookie, which unlocks /api/resume
  // (the PDF carries the same email + phone revealed here).
  const gate = await passGate(req, parsed.data.turnstileToken);
  if (!gate.ok) {
    return jsonResponse(
      { error: "Verification failed. Refresh and try again." },
      401,
    );
  }

  return jsonResponse(
    {
      email: process.env.CONTACT_EMAIL,
      phone: process.env.CONTACT_PHONE,
    },
    200,
    gate.setCookie,
  );
}

function jsonResponse(data: unknown, status = 200, setCookie?: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });
}
