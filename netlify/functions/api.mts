// Catch-all Netlify Function: serves the entire Express API.
//
// We inject the incoming Web Request into the Express app with
// light-my-request rather than serverless-http. serverless-http relies on the
// legacy AWS-Lambda event shape, and under Netlify's current runtime the
// request BODY was not reaching Express (GET worked, POST bodies were empty).
// light-my-request dispatches straight into the Express (req,res) handler with
// the payload + headers intact, and we map its response back to a Web Response.
import type { Context } from "@netlify/functions";
import inject from "light-my-request";
// @ts-expect-error - generated CJS bundle, no type declarations
import app from "../../artifacts/api-server/dist/app.cjs";

const dispatch = (app.default ?? app) as (req: unknown, res: unknown) => void;
const FN_PREFIX = "/.netlify/functions/api";

export default async (req: Request, _ctx: Context): Promise<Response> => {
  const url = new URL(req.url);
  // Express mounts its router at /api. Netlify usually passes the original
  // request path, but normalize the rewritten function path just in case.
  let pathname = url.pathname;
  if (pathname.startsWith(FN_PREFIX)) {
    pathname = "/api" + pathname.slice(FN_PREFIX.length);
  }

  const method = req.method.toUpperCase();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const payload =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await req.arrayBuffer());

  const res = await inject(dispatch, {
    method: method as "GET",
    url: pathname + url.search,
    headers,
    payload,
  });

  const outHeaders = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      // Preserve multiple Set-Cookie headers individually.
      for (const item of value) outHeaders.append(key, String(item));
    } else {
      outHeaders.set(key, String(value));
    }
  }

  return new Response(res.rawPayload, {
    status: res.statusCode,
    headers: outHeaders,
  });
};
