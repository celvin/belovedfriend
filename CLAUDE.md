# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"In Memory of Luis Ventura" — a tribute site where visitors leave a recorded video or designed condolence card. See [replit.md](replit.md) for product/architecture notes and [LOCAL_SETUP.md](LOCAL_SETUP.md) for env vars and database setup. This file covers the parts that matter when you're editing code.

## Live deployment

- **Frontend:** Netlify, site `luis-memorial` (id `8be6e40f-400b-4ec4-98c6-29789694b42d`). Custom domain `luisventura.org` (apex) + `www.luisventura.org` (301→apex). Built from this repo via [netlify.toml](netlify.toml) using `pnpm --filter @workspace/memorial run build`. Deploy with `netlify deploy --prod --dir=artifacts/memorial/dist/public --filter @workspace/memorial`.
- **Backend:** Railway, project `luis-memorial`, service `api`, public URL `https://api-production-a2bf.up.railway.app`. Built via [railway.json](railway.json). Deploy with `railway up` from repo root (CLI must be linked to the project).
- **API routing:** Netlify rewrites `/api/*` to the Railway URL ([netlify.toml](netlify.toml)) so the frontend and API share an origin — the JWT session cookie works without CORS config.
- **Database:** Neon Postgres (`luis` database, us-east-1). Apply schema changes with `DATABASE_URL=… pnpm --filter @workspace/db run push`.
- **Object storage:** GCS bucket `gs://luisventura` (us-east1). Service account `luis-memorial-api@luis-496520.iam.gserviceaccount.com` with `roles/storage.objectAdmin` on the bucket. Credentials passed to the server as `GOOGLE_CREDENTIALS_JSON` (inline JSON env var).
- **Email:** Resend (replaces SendGrid). Domain `luisventura.org` is verified in Resend; from-address is `noreply@luisventura.org`. DNS records (`resend._domainkey`, `send.*` SPF/MX/DMARC) live in the Netlify DNS zone for the domain.

## Package manager

**pnpm only.** A `preinstall` hook in the root [package.json](package.json) rejects npm/yarn and deletes their lockfiles. Use `pnpm install` from the repo root.

`pnpm-workspace.yaml` pins `minimumReleaseAge: 1440` (24h) as a supply-chain defense — do not lower it. New shared dependencies should go in the workspace `catalog:` block so versions stay consistent across packages.

## Workspace layout

Two long-running artifacts and four libraries:

- [artifacts/api-server](artifacts/api-server/) — Express 5 backend, bundled with esbuild to a single ESM file
- [artifacts/memorial](artifacts/memorial/) — React 19 + Vite frontend
- [artifacts/mockup-sandbox](artifacts/mockup-sandbox/) — dev-only component preview server
- [lib/api-spec](lib/api-spec/) — `openapi.yaml` is the source of truth for the HTTP contract
- [lib/api-client-react](lib/api-client-react/) — **generated** React Query hooks (do not hand-edit `src/generated/`)
- [lib/api-zod](lib/api-zod/) — **generated** Zod validators (do not hand-edit `src/generated/`)
- [lib/db](lib/db/) — Drizzle schema + Postgres pool

The frontend imports the generated hooks; the API server imports the generated Zod schemas to validate requests. Both regenerate from a single Orval run.

## Common commands

```bash
# Run the two services (separate terminals)
pnpm --filter @workspace/api-server run dev   # Express on $PORT (5000 in Replit)
pnpm --filter @workspace/memorial run dev     # Vite — needs PORT + BASE_PATH set

# Typecheck — fastest signal that nothing is broken
pnpm run typecheck            # full workspace (libs via project refs, artifacts via per-pkg tsc)
pnpm run typecheck:libs       # just the lib/ project references

# Build everything
pnpm run build                # typecheck, then per-package build

# Regenerate API client + Zod after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# DB schema (dev: push; raw SQL also in db-export/schema.sql)
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run push-force   # only when push refuses
```

No test suite is wired up — there are no `test` scripts in any package.

## Codegen workflow (must follow)

The OpenAPI spec at [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml) drives both client and server validation. Whenever you change request/response shapes:

1. Edit `openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen` — this regenerates `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`, then runs `typecheck:libs` to fail fast on contract drift.
3. Update the route handler in `artifacts/api-server/src/routes/*.ts` to match (it imports the regenerated Zod schemas for `safeParse`).
4. Update the frontend call site if the hook signature changed.

Editing files under `src/generated/` directly will be wiped on the next codegen run (`clean: true` in [orval.config.ts](lib/api-spec/orval.config.ts)).

## TypeScript setup

- `tsconfig.base.json` is the shared compiler config. All packages extend it.
- The root `tsconfig.json` uses **project references** for the `lib/*` packages so `pnpm run typecheck:libs` does incremental builds across them.
- Artifacts (`artifacts/*`) and `scripts/` are typechecked one-shot via their own `tsc --noEmit`.
- `customConditions: ["workspace"]` is set — workspace packages export `./src/*.ts` directly without a build step, which is why edits to lib code show up immediately in artifacts.

## API server specifics

- Entry: [artifacts/api-server/src/index.ts](artifacts/api-server/src/index.ts) → [app.ts](artifacts/api-server/src/app.ts) → [routes/index.ts](artifacts/api-server/src/routes/index.ts). All routes are mounted under `/api`.
- Bundled via [build.mjs](artifacts/api-server/build.mjs) (esbuild, ESM output). A long `external` list keeps native modules un-bundled; `esbuild-plugin-pino` handles pino's worker transports. If you add a dependency that uses native code or workers, you likely need to add it to that external list.
- Session = JWT cookie `lv_session` (HttpOnly, Secure, SameSite=lax, 30d). See [lib/session.ts](artifacts/api-server/src/lib/session.ts) for `requireAuth` / `requireAdmin` middlewares.
- Magic-link verification is an **atomic conditional UPDATE** in [routes/auth.ts](artifacts/api-server/src/routes/auth.ts) — preserve this pattern; do not refactor it to select-then-update or concurrent consume requests can both succeed.
- `ADMIN_EMAIL` (defaults to `crivas@cikume.com`) is auto-promoted to admin on first magic-link verify.
- Email is sent via Resend ([lib/email.ts](artifacts/api-server/src/lib/email.ts)) — the module is lazy-init so the server boots even when `RESEND_*` env vars are missing (auth routes will then 500 on first call).
- Object storage uses standard GCS auth via [lib/objectStorage.ts](artifacts/api-server/src/lib/objectStorage.ts). Pass service-account creds as `GOOGLE_CREDENTIALS_JSON` (inline JSON), or fall back to Application Default Credentials. Signed PUT URLs use `getSignedUrl({ version: "v4", action: "write" })` — no sidecar required.

Required env: `PORT` (Railway auto-injects), `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CREDENTIALS_JSON`, plus storage path vars (`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`). Optionally `PUBLIC_BASE_URL` for magic-link URLs outside Replit.

## Frontend specifics

- Router: `wouter` (see [App.tsx](artifacts/memorial/src/App.tsx)). Pages live in [src/pages/](artifacts/memorial/src/pages/).
- Data: TanStack Query via the generated hooks in `@workspace/api-client-react`. All calls go through `customFetch` ([lib/api-client-react/src/custom-fetch.ts](lib/api-client-react/src/custom-fetch.ts)) with `baseUrl: "/api"`.
- Path alias `@/*` → `artifacts/memorial/src/*` (Vite + tsconfig).
- UI: shadcn/ui primitives in [src/components/ui/](artifacts/memorial/src/components/ui/), Tailwind v4 (config-less, theme in [src/index.css](artifacts/memorial/src/index.css)).
- Vite requires `PORT` and `BASE_PATH` env vars to start — it throws on missing values rather than guessing.
- React/react-dom versions are pinned exactly in the catalog (Expo compatibility); do not bump them in isolation.

## Database

- Drizzle schema in [lib/db/src/schema/](lib/db/src/schema/): `users`, `messages`, `magicLinks`.
- The `messages.card` column is `jsonb` on purpose — card template shape can evolve without migrations.
- Use `db` and the schema tables imported from `@workspace/db` / `@workspace/db/schema`. Do not new up a separate pg `Pool`.

## Replit deployment context

- [.replit](.replit) declares Node 24 + Postgres 16. `postMerge` (`scripts/post-merge.sh`) reinstalls deps and runs `pnpm --filter db push` after each merge.
- `REPLIT_DOMAINS` is used by `resolveBaseUrl` in [routes/auth.ts](artifacts/api-server/src/routes/auth.ts) for magic-link URLs; in production `PUBLIC_BASE_URL=https://luisventura.org` overrides it.
- The platform-specific package overrides in `pnpm-workspace.yaml` strip everything except `linux-x64-gnu` (Railway + Netlify match this; Replit too). **Local Mac builds will fail on rollup/esbuild** because the darwin binaries are also stripped — workaround: `npm pack @rollup/rollup-darwin-arm64@<version>` and extract it into `node_modules/@rollup/rollup-darwin-arm64/` before running `vite build`. CI builds on linux are unaffected.
