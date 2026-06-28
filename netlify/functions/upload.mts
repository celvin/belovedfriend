import type { Context, Config } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { mediaStore } from "./_shared/blobs";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ["image/", "video/"];

function uid(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)lv_session=([^;]+)/.exec(cookie);
  if (!m) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const decoded = jwt.verify(decodeURIComponent(m[1]), secret) as { uid?: number };
    return typeof decoded.uid === "number" ? String(decoded.uid) : null;
  } catch {
    return null;
  }
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!uid(req)) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  const contentType = req.headers.get("content-type") ?? "application/octet-stream";
  if (!ALLOWED.some((p) => contentType.toLowerCase().startsWith(p)))
    return new Response(JSON.stringify({ error: "Only image and video uploads are allowed." }), { status: 415 });
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > MAX_BYTES)
    return new Response(JSON.stringify({ error: "File too large. Max ~20 MB." }), { status: 413 });
  const key = `uploads/${randomUUID()}`;
  await mediaStore().set(key, buf, { metadata: { contentType } });
  return new Response(JSON.stringify({ objectPath: `/objects/${key}` }), {
    status: 201, headers: { "content-type": "application/json" },
  });
};

export const config: Config = { path: "/api/uploads" };
