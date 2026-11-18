/**
 * /api/private-files/{brief|resume}
 *
 * Sync endpoint for the Fit Bot brief and the resume PDF, which can't
 * live in this public repo. Lets any of Jared's machines pull and push
 * them without a commit or a deploy. Client: `pnpm run private:download`
 * and `pnpm run private:upload` (scripts/private-sync.ts).
 *
 * Both methods require `Authorization: Bearer <PRIVATE_UPLOAD_SECRET>`
 * (same value in Vercel and .env.local); every request is refused while
 * it's unset or short.
 *
 * GET returns the stored bytes with `ETag: "<sha256>"`.
 *
 * PUT replaces them. The body is the raw file, validated before storing
 * (brief markers + length, PDF magic) so a truncated or wrong file can't
 * replace a good one. Optimistic concurrency, so an older copy on one
 * machine can't silently overwrite newer content from another:
 *   If-Match: "<sha256>"  the version this upload was based on
 *   If-None-Match: *      create only
 * A mismatch is 412 with the current hash; omit both to force. This
 * instance serves a new copy immediately; other warm instances pick it
 * up within five minutes (see private-files.ts).
 */

import { isAuthorizedBearer } from "@/lib/cron-auth";
import {
  InvalidPrivateFileError,
  privateFileByName,
  readStoredPrivateFile,
  storePrivateFile,
  type PrivateFile,
} from "@/lib/private-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel caps request bodies at 4.5 MB; stay under it with a clear error. */
const MAX_BYTES = 4 * 1024 * 1024;

type Ctx = RouteContext<"/api/private-files/[name]">;

function error(status: number, message: string, extra: object = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

/** Auth + name lookup shared by both methods. */
async function resolve(
  req: Request,
  ctx: Ctx,
): Promise<{ file: PrivateFile } | { res: Response }> {
  if (
    !isAuthorizedBearer(
      req.headers.get("authorization"),
      process.env.PRIVATE_UPLOAD_SECRET,
    )
  ) {
    return { res: error(401, "Unauthorized") };
  }
  const { name } = await ctx.params;
  const file = privateFileByName(name);
  return file
    ? { file }
    : { res: error(404, `Unknown file "${name}". Use "brief" or "resume".`) };
}

function unquote(etag: string | null): string | undefined {
  const value = etag?.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return value || undefined;
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await resolve(req, ctx);
  if ("res" in r) return r.res;
  try {
    const stored = await readStoredPrivateFile(r.file);
    if (!stored) return error(404, `Nothing uploaded for "${r.file.name}" yet.`);
    return new Response(new Uint8Array(stored.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stored.bytes.length),
        ETag: `"${stored.sha256}"`,
        "Last-Modified": new Date(stored.updatedAt).toUTCString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[private-files] read "${r.file.name}" failed:`, err);
    return error(503, "Database unavailable.");
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const r = await resolve(req, ctx);
  if ("res" in r) return r.res;

  const tooBig = () =>
    error(413, `File is over ${MAX_BYTES / 1024 / 1024} MB.`);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return tooBig();
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return tooBig();

  try {
    const result = await storePrivateFile(r.file, bytes, {
      ifMatch: unquote(req.headers.get("if-match")),
      ifNoneMatch: req.headers.get("if-none-match")?.trim() === "*",
    });
    if (result.status === "conflict") {
      return error(
        412,
        "The stored copy changed since this one was synced. Download first, or force.",
        { current: result.current },
      );
    }
    return Response.json(
      { ok: true, name: r.file.name, changed: result.changed, sha256: result.sha256, bytes: bytes.length },
      { headers: { ETag: `"${result.sha256}"` } },
    );
  } catch (err) {
    if (err instanceof InvalidPrivateFileError) return error(422, err.message);
    console.error(`[private-files] store "${r.file.name}" failed:`, err);
    return error(503, "Database unavailable. Nothing was changed.");
  }
}
