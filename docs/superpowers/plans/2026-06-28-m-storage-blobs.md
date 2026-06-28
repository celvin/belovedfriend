# Milestone: Storage → Netlify Blobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Replace the GCS signed-URL storage with Netlify Blobs. Media (images + video ≤ ~20 MB) uploads and downloads run through **dedicated native Netlify Functions** (streaming, not the Express catch-all), keyed in a single Blobs store. Removes `@google-cloud/storage`.

**Architecture:** Two native functions — `upload` (POST, verifies the session cookie, reads the request body ≤20 MB, writes to a Blobs store, returns an object path) and `media` (GET, streams a blob out). `netlify.toml` carves `/api/uploads` and `/api/objects/*` out to these functions **before** the `/api/*` Express catch-all (first-match-wins). The Express storage router and GCS modules are deleted; `messages` delete uses Blobs delete.

**Tech Stack:** `@netlify/blobs`, native Netlify Functions (Web Request/Response), `jsonwebtoken` (session verify), the existing `lv_session` cookie.

Part of the spec §13. **Deferred verification:** everything here is verified at the first deploy (this Mac can't run it; native function routing + Blobs are Netlify-only).

## Global Constraints

- **pnpm only; no tests; no secrets.** Verification: `pnpm run typecheck:libs` PASS; `pnpm --filter @workspace/api-server run typecheck` GREEN; native function files are not in a typechecked project (confirm they're syntactically sound by eye).
- **No deploy** here. Runtime verified at the first deploy.
- Blobs is zero-config on Netlify compute (`getStore({ name })`). Local dev would need `@netlify/vite-plugin` — not needed since we verify at deploy.
- Session secret + Blobs come from Netlify env at runtime; never commit secrets.
- **CONCENTRATED DEPLOY RISKS (record in ledger):** (1) netlify.toml redirect precedence — the `/api/uploads` and `/api/objects/*` carve-outs MUST win over `/api/*`; first-match-wins in netlify.toml, so order them first. (2) Native-function dependency resolution (`@netlify/blobs`, `jsonwebtoken`) in the pnpm workspace — declared in `artifacts/api-server/package.json` (same pattern as `serverless-http`). (3) Session-cookie verification inside the native function (inline jwt.verify). (4) 20 MB streamed-payload ceiling on the upload function.

---

### Task 1: Native Blobs upload + media functions + routing + dep

**Files:** Create `netlify/functions/upload.ts`, `netlify/functions/media.ts`, `netlify/functions/_shared/blobs.ts`; modify `netlify.toml`, `artifacts/api-server/package.json` (+ lockfile), `pnpm-workspace.yaml` (catalog).

**Interfaces (produced):** Upload endpoint `POST /api/uploads` (auth required, multipart or raw body) → `{ objectPath: "/objects/<key>" }`. Serve endpoint `GET /api/objects/*` → the blob bytes with its content-type. Object paths stored on messages as `/objects/<key>` (so the frontend uses `/api${objectPath}` to display — same shape as before).

- [ ] **Step 1: Add the Blobs dep.** Add `@netlify/blobs: ^8.1.0` (or the latest release ≥24h old) to the `catalog:` in `pnpm-workspace.yaml` and as `"@netlify/blobs": "catalog:"` in `artifacts/api-server/package.json`. Run `pnpm install`.

- [ ] **Step 2: Shared blobs helper.** `netlify/functions/_shared/blobs.ts`:
```ts
import { getStore } from "@netlify/blobs";
export const MEDIA_STORE = "media";
export function mediaStore() {
  return getStore({ name: MEDIA_STORE, consistency: "strong" });
}
// Object paths are stored on rows as "/objects/<key>"; the key is the blob key.
export function keyFromObjectPath(objectPath: string): string | null {
  const m = /^\/objects\/(.+)$/.exec(objectPath);
  return m ? m[1] : null;
}
```

- [ ] **Step 3: Upload function.** `netlify/functions/upload.ts` (native; verifies the `lv_session` cookie inline; accepts a raw body with `content-type` header; ≤20 MB):
```ts
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
```

- [ ] **Step 4: Media (serve) function.** `netlify/functions/media.ts` (native; streams a blob out by key):
```ts
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
```
> Note: object paths are stored as `/objects/uploads/<uuid>`; the splat captures `uploads/<uuid>`. The `key` derivation above normalizes that — confirm the exact splat value at deploy and adjust if the captured segment differs (deploy-verify item).

- [ ] **Step 5: netlify.toml routing.** Add carve-out redirects ABOVE the existing `/api/*` redirect (first-match-wins):
```toml
[[redirects]]
  from = "/api/uploads"
  to = "/.netlify/functions/upload"
  status = 200
  force = true

[[redirects]]
  from = "/api/objects/*"
  to = "/.netlify/functions/media/:splat"
  status = 200
  force = true
```
(Keep the `/api/*` → `/.netlify/functions/api/:splat` redirect AFTER these, and the SPA fallback last.)

- [ ] **Step 6: Verify + commit.** `pnpm run typecheck:libs` PASS; `pnpm --filter @workspace/api-server run typecheck` GREEN (these functions aren't in a tsc project; eyeball them). Commit `netlify/functions/upload.ts`, `media.ts`, `_shared/blobs.ts`, `netlify.toml`, `pnpm-workspace.yaml`, `artifacts/api-server/package.json`, `pnpm-lock.yaml`:
  `feat(storage): native Netlify Blobs upload + media functions`

---

### Task 2: Remove GCS, point messages-delete at Blobs, clean the contract

**Files:** Delete `artifacts/api-server/src/lib/objectStorage.ts`, `artifacts/api-server/src/lib/objectAcl.ts`, `artifacts/api-server/src/routes/storage.ts`; modify `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/messages.ts`, `artifacts/api-server/package.json`, `artifacts/api-server/build.mjs`, `lib/api-spec/openapi.yaml` (+ codegen).

- [ ] **Step 1: Drop the Express storage router.** Remove the `storage` import + `router.use(storageRouter)` from `routes/index.ts`. Delete `routes/storage.ts`, `lib/objectStorage.ts`, `lib/objectAcl.ts`.

- [ ] **Step 2: messages delete → Blobs.** In `routes/messages.ts`, replace the `tryDeleteObject` helper (which used `objectStorageService.getObjectEntityFile(...).delete()`) with a Blobs-backed delete:
```ts
import { mediaStore, keyFromObjectPath } from "../../../netlify/functions/_shared/blobs";
async function tryDeleteObject(objectPath: string | null | undefined, log: { warn: (o: object, m: string) => void }) {
  if (!objectPath) return;
  const key = keyFromObjectPath(objectPath);
  if (!key) return;
  try { await mediaStore().delete(key); }
  catch (err) { log.warn({ err, objectPath }, "failed to delete blob"); }
}
```
(If importing across the `netlify/functions` boundary is awkward for the esbuild api-server build, duplicate the tiny `mediaStore`/`keyFromObjectPath` into an `artifacts/api-server/src/lib/blobs.ts` instead and import from there; the native functions can import that shared file too. Pick whichever keeps both the api-server build and the functions bundling clean — note the choice in the report.)

- [ ] **Step 3: Remove GCS deps.** Remove `@google-cloud/storage` and `google-auth-library` from `artifacts/api-server/package.json` dependencies. Remove the now-unused `@google-cloud/*` / `@google/*` entries from `build.mjs`'s `external` list (optional cleanup; leaving them is harmless). Run `pnpm install`.

- [ ] **Step 4: openapi cleanup + codegen.** Remove the `/storage/uploads/request-url` (and any `/storage/...`) paths/schemas from `openapi.yaml` (the upload is now a native function, not a generated client hook). Run `pnpm --filter @workspace/api-spec run codegen` → typecheck:libs green.

- [ ] **Step 5: Verify + commit.** `pnpm --filter @workspace/api-server run typecheck` GREEN; `pnpm run typecheck:libs` PASS. Commit the deletions + edits + regenerated client:
  `refactor(storage): remove GCS, route media deletes through Blobs`

---

## Self-Review

**Spec coverage (§13):** single Blobs store ✓; images + capped video (≤20 MB) ✓; upload via function ✓; serve via function with cache headers ✓; GCS removed ✓; messages-delete cleans blobs ✓.

**Placeholder scan:** code is concrete; the splat-key derivation and routing precedence are flagged as deploy-verify items (genuinely Netlify-runtime-dependent), not hand-waving.

**Deploy-risk list (for the ledger / first deploy):** redirect precedence (carve-outs before catch-all); native-function dep resolution; session-cookie verify in upload fn; 20 MB ceiling; exact splat param value in `media.ts`; per-tenant key prefixing intentionally skipped (flat `uploads/<uuid>`) for v1.

**Frontend note:** the upload helper (compose/video-recorder) must switch from "request signed URL + PUT to GCS" to "POST the file to `/api/uploads`" — done in the frontend-rebuild milestone (frontend is already red).
