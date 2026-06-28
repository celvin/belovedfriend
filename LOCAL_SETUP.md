# Local Setup — In Memory of Luis Ventura

This project was built in Replit but the codebase is portable. It uses:

- **Node.js 24** (anything ≥ 20.10 should work)
- **pnpm** workspaces (`npm i -g pnpm` if you don't have it)
- **PostgreSQL 14+** (any standard Postgres works — local install, Docker, Neon, Supabase, etc.)

---

## 1. Install dependencies

```bash
pnpm install
```

## 2. Create a Postgres database

Any Postgres instance is fine. Two easy options:

### Option A — local Postgres
```bash
createdb luis_memorial
```

### Option B — Docker
```bash
docker run --name lv-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
docker exec -it lv-pg createdb -U postgres luis_memorial
```

## 3. Environment variables

Create a `.env` file at the repo root (loaded by the workspaces that need it):

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/luis_memorial

# Long random string — used to sign JWT session cookies
SESSION_SECRET=replace-me-with-a-32+char-random-string

# The email that should be auto-promoted to admin on first sign-in
ADMIN_EMAIL=crivas@cikume.com

# Outgoing email (magic-link sign-in). Get from https://app.sendgrid.com/
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Object storage (video/photo uploads).
# In Replit these are auto-provided. On localhost you have two choices:
#   1. Run a GCS-compatible service (real GCS, or fake-gcs-server in Docker)
#   2. Swap artifacts/api-server/src/lib/objectStorage.ts for a local-disk impl
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket
PRIVATE_OBJECT_DIR=/your-bucket/private
PUBLIC_OBJECT_SEARCH_PATHS=/your-bucket/public

# Per-artifact ports (the Replit workflow set these automatically;
# pick anything free locally)
PORT=5000
```

## 4. Apply the database schema

Two equivalent options — pick one:

### Option A — Drizzle push (recommended for dev)
```bash
pnpm --filter @workspace/db run push
```

### Option B — raw SQL
Either of these files at the repo root will create everything:
- `db-export/schema.sql` — pg_dump of the live schema
- `lib/db/drizzle/0000_init.sql` — Drizzle-generated migration

```bash
psql "$DATABASE_URL" -f db-export/schema.sql
```

## 5. Generate API client/types

The API contract lives in `lib/api-spec/openapi.yaml`. Whenever you edit it:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## 6. Run the apps

This project is a monorepo with **two long-running services**:

```bash
# Terminal 1 — API server (Express, port 5000 by default)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (Vite)
pnpm --filter @workspace/memorial run dev
```

On Replit a reverse proxy sits in front of both services so the frontend can call
`/api/...` directly. Locally you have two choices:

1. **Vite dev proxy** — add a `server.proxy` block to
   `artifacts/memorial/vite.config.ts`:
   ```ts
   server: {
     proxy: { "/api": "http://localhost:5000" },
   },
   ```
2. **Run them on the same origin** behind nginx/caddy in production.

## 7. Useful scripts

```bash
pnpm run typecheck         # full workspace typecheck
pnpm run build             # typecheck + build everything
pnpm --filter @workspace/db run push   # apply schema changes
```

---

## Project layout

```
artifacts/
  api-server/     Express 5 API
  memorial/       React + Vite frontend
  mockup-sandbox/ Component preview server (dev-only)
lib/
  api-spec/       OpenAPI source of truth
  api-client-react/  Generated React Query hooks
  api-zod/        Generated Zod validators
  db/             Drizzle schema + migrations
db-export/
  schema.sql      Raw Postgres schema dump
```

See `replit.md` for product/architecture notes.

## Admin role

`crivas@cikume.com` is auto-promoted to `admin` on first magic-link sign-in
(controlled by the `ADMIN_EMAIL` env var). Admins get a **Manage** link in the
nav and access to `/admin` for full CRUD on tributes. Authorization is enforced
server-side with a per-request DB lookup.

## Storage note

Uploads use a presigned-URL flow against GCS. The `objectStorage.ts` helper
expects the Replit object-storage sidecar to be reachable. For pure localhost
work the cleanest replacement is to write a small local-disk implementation
that exposes the same `getObjectEntityUploadURL`, `getObjectEntityFile`,
`normalizeObjectEntityPath`, etc. — then you can keep all the routes unchanged.
