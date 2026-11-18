/**
 * PUT /api/private-files/{brief|resume}
 *
 * Replaces the Fit Bot brief or the resume PDF without a commit or a
 * deploy (this repo is public, so neither lives in git). The body is
 * the raw file. Authorized by `Authorization: Bearer
 * <PRIVATE_UPLOAD_SECRET>`, which must match between Vercel and
 * .env.local; every request is refused while it's unset or short.
 *
 * Content is validated before it's stored (brief markers + length, PDF
 * magic), so a truncated or wrong file can't replace a good one. This
 * instance serves the new copy immediately; every other warm instance
 * picks it up within five minutes (see private-files.ts).
 *
 * Client: `pnpm run private:upload` (also run by the pre-push hook).
 */

import { isAuthorizedBearer } from "@/lib/cron-auth";
import {
  InvalidPrivateFileError,
  privateFileByName,
  storePrivateFile,
} from "@/lib/private-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel caps request bodies at 4.5 MB; stay under it with a clear error. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function PUT(
  req: Request,
  ctx: RouteContext<"/api/private-files/[name]">,
) {
  if (
    !isAuthorizedBearer(
      req.headers.get("authorization"),
      process.env.PRIVATE_UPLOAD_SECRET,
    )
  ) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await ctx.params;
  const file = privateFileByName(name);
  if (!file) {
    return Response.json(
      { ok: false, error: `Unknown file "${name}". Use "brief" or "resume".` },
      { status: 404 },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return Response.json(
      { ok: false, error: `File is over ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    return Response.json(
      { ok: false, error: `File is over ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  try {
    const { changed, sha256 } = await storePrivateFile(file, bytes);
    return Response.json({ ok: true, name, changed, sha256, bytes: bytes.length });
  } catch (err) {
    if (err instanceof InvalidPrivateFileError) {
      return Response.json({ ok: false, error: err.message }, { status: 422 });
    }
    console.error(`[private-files] store "${name}" failed:`, err);
    return Response.json(
      { ok: false, error: "Database unavailable. Nothing was changed." },
      { status: 503 },
    );
  }
}
