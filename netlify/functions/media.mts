import type { Context, Config } from "@netlify/functions";
import { mediaStore } from "./_shared/blobs";

export default async (_req: Request, ctx: Context) => {
  const splat = ctx.params["splat"] ?? (ctx.params as Record<string, string>)["0"];
  if (!splat) return new Response("Not found", { status: 404 });
  const key = `uploads/${splat}`.replace(/^uploads\/uploads\//, "uploads/");
  const res = await mediaStore().getWithMetadata(key, { type: "stream" });
  if (!res) return new Response("Not found", { status: 404 });
  const contentType = (res.metadata?.contentType as string) ?? "application/octet-stream";
  return new Response(res.data as ReadableStream, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
  });
};

export const config: Config = { path: "/api/objects/*" };
