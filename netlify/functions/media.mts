import type { Context } from "@netlify/functions";
import { mediaStore } from "./_shared/blobs";

// Routed via netlify.toml redirect: /api/objects/* -> /.netlify/functions/media/:splat
// Without config.path there is no ctx.params splat, so derive the blob key
// from the request path. Object paths are stored as "/objects/<key>", and the
// blob key is "<key>" (e.g. "uploads/<uuid>"). Handle either the original
// "/api/objects/<key>" path or the rewritten "/.netlify/functions/media/<key>".
export default async (req: Request, _ctx: Context) => {
  const { pathname } = new URL(req.url);
  const m = /\/(?:objects|media)\/(.+)$/.exec(pathname);
  const key = m ? decodeURIComponent(m[1]) : null;
  if (!key) return new Response("Not found", { status: 404 });
  const res = await mediaStore().getWithMetadata(key, { type: "stream" });
  if (!res) return new Response("Not found", { status: 404 });
  const contentType = (res.metadata?.contentType as string) ?? "application/octet-stream";
  return new Response(res.data as ReadableStream, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
  });
};
