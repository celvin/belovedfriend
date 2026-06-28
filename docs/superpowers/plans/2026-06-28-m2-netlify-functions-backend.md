# Milestone 2: Backend on Netlify Functions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the existing Express API from a single in-repo Netlify Function mounted at `/api/*` (replacing the Railway proxy), with a DB-backed rate limiter and serverless-safe (sync) logging, verified locally with `netlify dev` / `netlify build`. **No deploy in this milestone.**

**Architecture:** The Express app is bundled to a standalone ESM module (`dist/app.mjs`) by the existing esbuild pipeline (which already resolves the `workspace` export condition and inlines workspace packages). A thin Netlify Function (`netlify/functions/api.ts`) imports that pre-built bundle and wraps it with `serverless-http`. `netlify.toml` redirects `/api/*` to the function. Building the bundle first (rather than letting Netlify's function bundler resolve the pnpm-workspace `./src/*.ts` exports) sidesteps the `customConditions: ["workspace"]` resolution problem.

**Tech Stack:** Netlify Functions, `serverless-http`, Express 5, esbuild (existing `build.mjs`), pino (sync), Netlify CLI 23.1.4, Drizzle/pg against `netlifydb`.

This is Milestone 2 of [the spec](../specs/2026-06-28-multi-tenant-tribute-platform-design.md). Storage→Netlify Blobs is a **separate follow-on plan** (not in M2). The first real deploy happens after tenant-scoped routes exist (later milestone), to **production** per the owner's decision.

## Global Constraints

- **pnpm only**, run from repo root. New deps go in the `pnpm-workspace.yaml` `catalog:` block (CLAUDE.md). `minimumReleaseAge: 1440` stays — pick `serverless-http` versions older than 24h (any stable release qualifies).
- **No automated tests** (owner's explicit decision). Verification is `pnpm --filter @workspace/api-server run build` (esbuild succeeds), `netlify build` (functions bundle), and `netlify dev` smoke checks with `curl`. There are no unit tests.
- **No secrets in git.** `netlifydb`/Resend/session secrets come from `secret.txt` (gitignored) for local runs and from Netlify env vars in deploys. Never commit a secret.
- **Do not deploy** in this milestone (no `netlify deploy`, no push to main). Local verification only.
- **Preserve the atomic magic-link consume** in `auth.ts` (the conditional UPDATE) — only the rate-limiter portion changes.
- **Keep `index.ts` / `app.listen`** intact — it remains the local `pnpm dev` entry and the (currently unused) Railway entry. The Function uses the bundled `app`, not `index.ts`.
- **Full-workspace `pnpm run typecheck` is expected RED** (M1 debt: routes don't pass `tenant_id` yet — fixed in later milestones). Do NOT fix route tenancy here. Netlify's build does not run `tsc`, and esbuild strips types, so this does not block the function build. `typecheck:libs` stays green.
- The known integration risks (request path handling through the redirect; runtime availability of externalized deps like `@google-cloud/storage`) are called out per-task with `netlify dev` verification and an escalation note. If a subagent cannot resolve one after one focused iteration, escalate BLOCKED with the observed behavior — do not guess.

---

## File Structure

- Create: `netlify/functions/api.ts` — catch-all Function wrapping the pre-built Express app with `serverless-http`.
- Modify: `artifacts/api-server/build.mjs` — add a second esbuild entry that emits `dist/app.mjs` exporting the Express `app` (alongside the existing `dist/index.mjs`).
- Modify: `artifacts/api-server/src/lib/logger.ts` — remove the `pino-pretty` worker transport; sync JSON logging in all envs.
- Modify: `artifacts/api-server/src/routes/auth.ts` — replace the in-memory rate limiter with a DB-backed count over `magic_links` (using `request_ip`), and persist `request_ip` on insert.
- Modify: `netlify.toml` — build api-server bundle + frontend; declare `functions` dir; redirect `/api/*` to the function; remove the Railway proxy; keep SPA fallback.
- Modify: `pnpm-workspace.yaml` — add `serverless-http` to the catalog.
- Modify: `artifacts/api-server/package.json` — add `serverless-http` (catalog) dependency.

---

### Task 1: Sync logging (remove pino worker transport)

Worker-thread transports (`pino-pretty`) don't run inside Netlify Functions. Switch to plain sync JSON logging.

**Files:** Modify `artifacts/api-server/src/lib/logger.ts`

**Interfaces:**
- Produces: `logger` (a pino instance, unchanged export name/shape) that writes sync JSON to stdout with the same redaction.

- [ ] **Step 1: Replace the logger module**

`artifacts/api-server/src/lib/logger.ts`:

```ts
import pino from "pino";

// Sync JSON logging only. Netlify Functions (and most serverless runtimes)
// cannot use pino's worker-thread transports (e.g. pino-pretty), so we emit
// structured JSON to stdout in every environment. Pipe through `pino-pretty`
// manually in local dev if you want colorized output.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
});
```

- [ ] **Step 2: Typecheck the api-server package**

Run: `pnpm --filter @workspace/api-server run typecheck 2>&1 | tail -20`
Expected: the ONLY errors (if any) are the pre-existing M1 tenancy errors in `routes/messages.ts` (missing `tenantId`). There must be NO new error in `logger.ts` or files importing the logger. If `logger.ts` itself errors, fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/logger.ts
git commit -m "feat(api): sync JSON logging for serverless (drop pino-pretty worker)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DB-backed magic-link rate limiter

Serverless instances don't share memory, so the in-memory `Map` limiter is ineffective. Count recent `magic_links` rows instead.

**Files:** Modify `artifacts/api-server/src/routes/auth.ts`

**Interfaces:**
- Consumes: `magicLinksTable` (now has `requestIp` from M1), `db`, drizzle `and/eq/gte/sql`.
- Produces: an async `rateLimited(email, ip)` check used in `POST /auth/request-link`; the magic-link insert now stores `requestIp`.

- [ ] **Step 1: Replace the in-memory limiter with a DB-backed check**

In `artifacts/api-server/src/routes/auth.ts`, delete the in-memory limiter block (the `RATE_WINDOW_MS`, `RATE_MAX_PER_KEY`, `rateBuckets`, and `rateLimit()` definitions) and add, near the top after imports:

```ts
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_PER_KEY = 5;

// Serverless-safe rate limit: count recent magic-link rows for this email or IP.
async function rateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(magicLinksTable)
    .where(
      and(
        gte(magicLinksTable.createdAt, since),
        or(eq(magicLinksTable.email, email), eq(magicLinksTable.requestIp, ip)),
      ),
    );
  return (rows[0]?.n ?? 0) >= RATE_MAX_PER_KEY;
}
```

Add `gte`, `or`, and `sql` to the existing `drizzle-orm` import (it already imports `and, eq, gt, isNull`):

```ts
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
```

- [ ] **Step 2: Use the async check and persist the IP**

In the `POST /auth/request-link` handler, replace the synchronous limiter call:

```ts
  if (await rateLimited(email, ip)) {
    res.status(429).json({
      error: "Too many requests. Please wait a few minutes and try again.",
    });
    return;
  }
```

and add `requestIp: ip` to the `db.insert(magicLinksTable).values({ ... })` call:

```ts
    await db.insert(magicLinksTable).values({
      email,
      tokenHash: hash,
      expiresAt,
      requestIp: ip,
    });
```

(The `ip` variable is already computed above the original limiter call — keep that computation.)

- [ ] **Step 3: Typecheck the api-server package**

Run: `pnpm --filter @workspace/api-server run typecheck 2>&1 | tail -20`
Expected: no new errors in `auth.ts`; only the pre-existing M1 `messages.ts` tenancy errors remain.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts
git commit -m "feat(api): DB-backed magic-link rate limiter (serverless-safe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Emit a standalone `app` bundle from esbuild

The Function needs the Express `app` as a self-contained ESM module with workspace packages already inlined.

**Files:** Modify `artifacts/api-server/build.mjs`

**Interfaces:**
- Produces: `artifacts/api-server/dist/app.mjs` with a default export = the Express `app`, in addition to the existing `dist/index.mjs`.

- [ ] **Step 1: Add `src/app.ts` as a second entry point**

In `build.mjs`, change the single `entryPoints` array to include both entries (keep every other option — `external`, `banner`, `plugins`, `format`, `outExtension`, etc. — identical):

```js
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/app.ts"),
    ],
```

`src/app.ts` already does `export default app;`, so esbuild emits `dist/app.mjs` with that default export. No source change needed.

- [ ] **Step 2: Build and confirm both outputs exist**

Run:
```bash
pnpm --filter @workspace/api-server run build
ls artifacts/api-server/dist/
```
Expected: esbuild reports success; `dist/` contains both `index.mjs` and `app.mjs` (plus sourcemaps and the pino transport chunk). If esbuild fails, capture the error — a missing-export or resolution failure here is a real blocker to escalate.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/build.mjs
git commit -m "build(api): emit standalone dist/app.mjs bundle for serverless wrapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add `serverless-http` and the catch-all Function

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog), `artifacts/api-server/package.json` (dep)
- Create: `netlify/functions/api.ts`

**Interfaces:**
- Produces: a Netlify Function whose `handler` (AWS-Lambda-style, which Netlify supports) serves the Express app. Reached at `/api/*` via the redirect added in Task 5.

- [ ] **Step 1: Add `serverless-http` to the catalog and api-server deps**

In `pnpm-workspace.yaml`, add under the `catalog:` block:

```yaml
  serverless-http: ^3.2.0
```

In `artifacts/api-server/package.json` dependencies, add:

```json
    "serverless-http": "catalog:",
```

Then install: `pnpm install`
Expected: lockfile updates, `serverless-http` resolves. (If `minimumReleaseAge` rejects `^3.2.0` as too new, pick the latest release older than 24h and use that exact version.)

- [ ] **Step 2: Create the Function**

`netlify/functions/api.ts`:

```ts
// Catch-all Netlify Function: serves the entire Express API.
// It imports the PRE-BUILT app bundle (dist/app.mjs) so Netlify's function
// bundler never has to resolve the pnpm-workspace `./src/*.ts` exports.
// Build order is enforced by netlify.toml (api-server build runs first).
import serverless from "serverless-http";
// @ts-expect-error - generated ESM bundle, no type declarations
import app from "../../artifacts/api-server/dist/app.mjs";

export const handler = serverless(app.default ?? app);
```

- [ ] **Step 3: Typecheck does not regress**

Run: `pnpm run typecheck:libs`
Expected: PASS (the new function file is not part of a typechecked package; this confirms libs are still green).

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml artifacts/api-server/package.json pnpm-lock.yaml netlify/functions/api.ts
git commit -m "feat(netlify): add serverless-http catch-all API function

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire `netlify.toml` to build + route the Function locally

**Files:** Modify `netlify.toml`

**Interfaces:**
- Produces: a build that compiles the api-server bundle then the frontend; a `functions` directory; an `/api/*` → function redirect replacing the Railway proxy; the SPA fallback retained.

- [ ] **Step 1: Rewrite `netlify.toml`**

```toml
[build]
  base = "."
  command = "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/memorial run build"
  publish = "artifacts/memorial/dist/public"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "22"
  BASE_PATH = "/"
  PORT = "4173"
  NPM_FLAGS = "--version" # opt out of Netlify's default npm install — pnpm runs in `command`

# Serve the API from the in-repo Netlify Function (replaces the Railway proxy).
# Same-origin, so the JWT session cookie (HttpOnly, SameSite=lax) keeps working.
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
  force = true

# SPA fallback — every non-asset URL serves index.html so wouter can route client-side.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Verify the Function bundles via `netlify build`**

Run (DATABASE_URL etc. not required for bundling): `netlify build 2>&1 | tail -30`
Expected: the build runs the api-server esbuild, builds the frontend, and zip-it-and-ship-it reports bundling `api` with no resolution errors. If it fails to bundle `@google-cloud/storage` or another externalized dep, that's a known risk — see Step 4 note; capture the exact error.

- [ ] **Step 3: Smoke-test locally with `netlify dev`**

Start dev (load env from `secret.txt`: set `DATABASE_URL` to the `NETLIFY DB` string, plus `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` as needed). Run `netlify dev` in the background, then:

```bash
curl -s -i http://localhost:8888/api/healthz | head -20
curl -s -i http://localhost:8888/api/auth/me | head -20
```

Expected:
- `/api/healthz` → 200 (the health route — confirm the exact path by checking `routes/health.ts`; railway.json uses `/api/healthz`).
- `/api/auth/me` → 200 JSON `{ "authenticated": false, "user": null }` (this exercises the cookie/session middleware and confirms the Express app is actually handling the request through the Function).

**KNOWN INTEGRATION RISK — request path:** Express mounts the router at `/api`. If these curls return 404, the redirect splat is likely stripping `/api` before the Function sees it. Fix by either (a) changing the redirect `to` to `/.netlify/functions/api` (no `:splat`) so the original `/api/...` path is preserved, or (b) passing `serverless(app, { basePath: "/api" })`, or (c) mounting the Express router at `/` and keeping `/api` only in the redirect. Try option (a) first. If still 404 after one focused iteration, escalate BLOCKED with the observed `event.path` (add a temporary `console.log` in the function).

- [ ] **Step 4: Confirm DB connectivity through the Function**

With `netlify dev` still running and `DATABASE_URL` pointed at `netlifydb`:

```bash
curl -s -i -X POST http://localhost:8888/api/auth/request-link \
  -H 'content-type: application/json' \
  -d '{"email":"crivas@cikume.com"}' | head -30
```

Expected: a JSON response (200 `{ ok: true }` if Resend creds are present, or a clean 500 "couldn't send email" if not) — NOT a crash/timeout. Either proves the handler reached the DB (the `magic_links` insert + rate-limit query ran). If you get a 502/timeout, the bundle is missing a runtime dep (likely an externalized package such as `@google-cloud/storage`); capture the function logs and escalate — the fix is to ensure that dep is included in the function bundle (Netlify includes imported node_modules; an externalized-but-imported package may need `[functions] node_bundler = "esbuild"` plus `included_files`, or removing it from the esbuild `external` list so it's inlined).

- [ ] **Step 5: Commit**

```bash
git add netlify.toml
git commit -m "feat(netlify): serve /api via in-repo function, drop Railway proxy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (spec §14):**
- Wrap Express in one catch-all Function via serverless-http → Tasks 3–5 ✓
- DB-backed rate limiter → Task 2 ✓
- pino sync logging (no worker transports) → Task 1 ✓
- `process.env` for env (unchanged; serverless-http preserves it) ✓
- netlify.toml functions dir + `/api/*` routing, drop Railway proxy → Task 5 ✓
- Blobs storage layer → **explicitly deferred to the storage follow-on plan** (noted in header), not a gap.

**Placeholder scan:** The bracketed items are the two genuine integration unknowns (request-path handling, externalized-dep bundling) — each has a concrete first-choice fix and an escalation path with a named diagnostic, not hand-waving. All code blocks are complete.

**Type consistency:** `rateLimited(email, ip)` is async and awaited at its one call site; `requestIp` matches the M1 column; the function uses `app.default ?? app` to tolerate either interop shape of the esbuild default export; logger export name/shape unchanged so all importers keep compiling.

**Risk acknowledgement:** This is integration work, not mechanical transcription. Tasks 1–4 are deterministic; Task 5 Steps 2–4 are empirical (`netlify build`/`netlify dev`) and may require one iteration on path/bundling. Those are the natural stopping points for escalation.
