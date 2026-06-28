# In Memory of Luis Ventura

A warm, dignified online tribute site where friends, family, colleagues, and clients of Luis Ventura can leave a recorded video message or a personalized condolence card.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API contract: `lib/api-spec/openapi.yaml` (regenerate hooks/zod after edits)
- DB schema: `lib/db/src/schema/` (users, magicLinks, messages)
- Theme/palette: `artifacts/memorial/src/index.css`
- Frontend pages: `artifacts/memorial/src/pages/{home,sign-in,compose,wall,tribute-detail}.tsx`
- Server routes: `artifacts/api-server/src/routes/{auth,messages,reach,storage}.ts`
- Session/JWT helpers: `artifacts/api-server/src/lib/session.ts`
- Sendgrid integration helper: `artifacts/api-server/src/lib/sendgrid.ts`
- Curated reach network data: `artifacts/api-server/src/routes/reach.ts`

## Architecture decisions

- Magic-link auth (no passwords). Tokens are 32-byte random, sha256-hashed in DB, 30 min TTL, single-use. Verification is an atomic conditional UPDATE so concurrent verify requests can't both succeed.
- Sessions are JWT cookies (`lv_session`) signed by `SESSION_SECRET`. HttpOnly, Secure, SameSite=lax, 30-day TTL.
- Card design is stored as a single jsonb column on `messages` so the front-end is free to evolve templates without schema churn.
- The "reach network" is hand-curated, illustrative public-works data — not a claim of an exhaustive client list.
- Uploads use presigned PUT URLs to GCS. The presign endpoint requires auth, restricts to image/video MIME, and caps size at 200 MB.

## Product

- Home with a quiet hero and an animated "reach" constellation
- Email magic-link sign-in
- Compose: record a video tribute (browser MediaRecorder) or design a condolence card (6 templates, photo upload)
- Public Tribute Wall with a card/video mosaic and filter chips
- Single-tribute detail page

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
