# Milestone 1: Database Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the multi-tenant Postgres schema (tenants, reach graph, blocks, and tenant-scoped messages/magic-links) on a freshly provisioned `belovedfriend_db`, leaving the workspace typechecking green.

**Architecture:** Shared-database multi-tenancy. New Drizzle tables carry a `tenant_id` FK; existing `messages`/`magic_links` are extended. Schema is applied with `drizzle-kit push` (the repo's existing workflow) against a new Netlify-managed Neon database. No application logic changes in this milestone — only schema and the committed `db-export/schema.sql` snapshot.

**Tech Stack:** Drizzle ORM `^0.45.2`, drizzle-kit `^0.31.10`, Postgres 16 (Neon via Netlify DB), pnpm workspaces, `pg_dump`/`psql` for the schema snapshot.

This is Milestone 1 of the spec at [docs/superpowers/specs/2026-06-28-multi-tenant-tribute-platform-design.md](../specs/2026-06-28-multi-tenant-tribute-platform-design.md). Subsequent milestones get their own plans, written against the real code once this lands.

## Global Constraints

- **pnpm only.** Run everything from the repo root; never invoke npm/yarn (a preinstall hook deletes their lockfiles).
- **No secrets in git.** The LUIS and Netlify DB connection strings and the Resend key live in the untracked, gitignored `secret.txt`. Pass them inline as env vars on the command line; never write them into a tracked file, this plan, or a commit.
- **Schema workflow is `drizzle-kit push`** (not generate/migrate files): `pnpm --filter @workspace/db run push`. `push-force` only if push refuses.
- **Verification is typecheck + push + psql inspection** (this project has no test suite by decision). There are no unit tests in this milestone.
- **Drizzle table-extras use the array-return form** `(table) => [ ... ]` (drizzle-orm 0.45 style), e.g. `index("name").on(table.col)`, `unique("name").on(table.a, table.b)`.
- **New select/insert types follow the existing `*Row` / `Insert*` convention** (mirror `messages.ts`'s `MessageRow` / `InsertMessage`).
- **`messages.tenant_id` is `NOT NULL`.** This is safe because the target `belovedfriend_db` starts empty; existing Luis rows are imported with `tenant_id` set in the later migration milestone.
- **Typecheck command:** `pnpm run typecheck:libs` (incremental project-reference build across `lib/*`).

---

## File Structure

- Create: `lib/db/src/schema/tenants.ts` — `tenants` table (page metadata, owner, page_config).
- Create: `lib/db/src/schema/reachNodes.ts` — `reach_nodes` table (memory-map nodes).
- Create: `lib/db/src/schema/reachEdges.ts` — `reach_edges` table (connections).
- Create: `lib/db/src/schema/tenantBlocks.ts` — `tenant_blocks` table (per-tenant account blocks).
- Modify: `lib/db/src/schema/messages.ts` — add `tenant_id`, `url`, `node_id` + tenant index.
- Modify: `lib/db/src/schema/magicLinks.ts` — add `redirect_to`, `request_ip`.
- Modify: `lib/db/src/schema/index.ts` — export the four new tables.
- Modify: `db-export/schema.sql` — refreshed from LUIS (baseline), then regenerated from `belovedfriend_db`.

---

### Task 1: Refresh `db-export/schema.sql` from the live LUIS database

Establishes an accurate production baseline before any schema change (explicitly requested) and surfaces any drift between LUIS and the committed snapshot.

**Files:**
- Modify: `db-export/schema.sql`

- [ ] **Step 1: Dump the live LUIS schema to a scratch file**

Use the `LUIS` connection string from `secret.txt` (read it, do not paste it anywhere tracked). Run:

```bash
LUIS_URL='<LUIS connection string from secret.txt>'
pg_dump --schema-only --no-owner --no-privileges "$LUIS_URL" > /private/tmp/claude-501/-Users-celvinrivas-Projects-belovedfriend-org/cdbe6794-a1cd-4c8d-92da-f6c6d42e4e82/scratchpad/luis-schema.sql
```

Expected: a `.sql` file containing `CREATE TABLE public.users / messages / magic_links`. If `pg_dump` warns about a server/version mismatch but still produces output, that is acceptable. If it errors hard, add `--no-sync` is not needed; instead confirm the homebrew `pg_dump` major version (`pg_dump --version`) and proceed — Neon accepts dumps from equal-or-newer clients.

- [ ] **Step 2: Compare against the committed snapshot**

Run:

```bash
diff <(grep -E 'CREATE TABLE|^[[:space:]]+[a-z_]+ ' /private/tmp/claude-501/-Users-celvinrivas-Projects-belovedfriend-org/cdbe6794-a1cd-4c8d-92da-f6c6d42e4e82/scratchpad/luis-schema.sql) <(grep -E 'CREATE TABLE|^[[:space:]]+[a-z_]+ ' db-export/schema.sql) || true
```

Expected: minimal/no differences (the snapshot already lists `users`, `messages`, `magic_links`). Note any real column drift in the commit message — it informs the later Luis migration milestone.

- [ ] **Step 3: Replace the committed snapshot with the fresh LUIS dump**

```bash
cp /private/tmp/claude-501/-Users-celvinrivas-Projects-belovedfriend-org/cdbe6794-a1cd-4c8d-92da-f6c6d42e4e82/scratchpad/luis-schema.sql db-export/schema.sql
```

- [ ] **Step 4: Verify no secret leaked into the file**

```bash
grep -nE 'npg_|password|neon.tech' db-export/schema.sql || echo "clean — no credentials in dump"
```

Expected: `clean — no credentials in dump`. A `pg_dump --schema-only` output contains the `\restrict` token already present in the current file but no credentials; if any connection string appears, remove it before committing.

- [ ] **Step 5: Commit**

```bash
git add db-export/schema.sql
git commit -m "chore: refresh db-export/schema.sql from live LUIS database

Baseline production schema captured before multi-tenant changes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add the `tenants` table

**Files:**
- Create: `lib/db/src/schema/tenants.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Produces: `tenantsTable` (Drizzle table, db name `tenants`), types `TenantRow` / `InsertTenant`. Columns: `id, slug, friendName, birthYear, deathYear, tagline, ownerUserId, status, pageConfig, createdAt`.
- Consumes: `usersTable` from `./users` for the `owner_user_id` FK.

- [ ] **Step 1: Create the table file**

`lib/db/src/schema/tenants.ts`:

```ts
import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tenantsTable = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    friendName: text("friend_name").notNull(),
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    tagline: text("tagline"),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("active"),
    pageConfig: jsonb("page_config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tenants_owner_user_id_idx").on(table.ownerUserId)],
);

export type TenantRow = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
```

- [ ] **Step 2: Export it from the schema barrel**

Edit `lib/db/src/schema/index.ts` to add the export immediately after the `users` line (tables that others FK-reference are exported first):

```ts
export * from "./users";
export * from "./tenants";
export * from "./messages";
export * from "./magicLinks";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: PASS (no errors). If it reports an unused-import or missing-export error, fix it before continuing.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/tenants.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add tenants table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add the `reach_nodes` and `reach_edges` tables

These are coupled (edges FK to nodes), so they land together.

**Files:**
- Create: `lib/db/src/schema/reachNodes.ts`
- Create: `lib/db/src/schema/reachEdges.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Produces: `reachNodesTable` (db `reach_nodes`), types `ReachNodeRow` / `InsertReachNode`. Columns: `id, tenantId, label, category, lat, lng, note, isAnchor, createdByUserId, createdAt`.
- Produces: `reachEdgesTable` (db `reach_edges`), types `ReachEdgeRow` / `InsertReachEdge`. Columns: `id, tenantId, sourceNodeId, targetNodeId, createdByUserId, createdAt`. Unique on `(tenantId, sourceNodeId, targetNodeId)`; node FKs cascade-delete.
- Consumes: `tenantsTable`, `usersTable`, and (edges) `reachNodesTable`.

> Note: the type is named `ReachNodeRow` deliberately to avoid colliding with the generated `ReachNode` type in `@workspace/api-client-react` used by the frontend map component.

- [ ] **Step 1: Create `reachNodes.ts`**

```ts
import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const reachNodesTable = pgTable(
  "reach_nodes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    label: text("label").notNull(),
    category: text("category").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    note: text("note"),
    isAnchor: boolean("is_anchor").notNull().default(false),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reach_nodes_tenant_id_idx").on(table.tenantId)],
);

export type ReachNodeRow = typeof reachNodesTable.$inferSelect;
export type InsertReachNode = typeof reachNodesTable.$inferInsert;
```

- [ ] **Step 2: Create `reachEdges.ts`**

```ts
import {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { reachNodesTable } from "./reachNodes";
import { usersTable } from "./users";

export const reachEdgesTable = pgTable(
  "reach_edges",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    sourceNodeId: integer("source_node_id")
      .notNull()
      .references(() => reachNodesTable.id, { onDelete: "cascade" }),
    targetNodeId: integer("target_node_id")
      .notNull()
      .references(() => reachNodesTable.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reach_edges_tenant_id_idx").on(table.tenantId),
    unique("reach_edges_unique").on(
      table.tenantId,
      table.sourceNodeId,
      table.targetNodeId,
    ),
  ],
);

export type ReachEdgeRow = typeof reachEdgesTable.$inferSelect;
export type InsertReachEdge = typeof reachEdgesTable.$inferInsert;
```

- [ ] **Step 3: Export both from the barrel**

`lib/db/src/schema/index.ts` (add after the `tenants` line):

```ts
export * from "./users";
export * from "./tenants";
export * from "./reachNodes";
export * from "./reachEdges";
export * from "./messages";
export * from "./magicLinks";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/reachNodes.ts lib/db/src/schema/reachEdges.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add reach_nodes and reach_edges tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add the `tenant_blocks` table

**Files:**
- Create: `lib/db/src/schema/tenantBlocks.ts`
- Modify: `lib/db/src/schema/index.ts`

**Interfaces:**
- Produces: `tenantBlocksTable` (db `tenant_blocks`), types `TenantBlockRow` / `InsertTenantBlock`. Columns: `id, tenantId, userId, blockedByUserId, createdAt`. Unique on `(tenantId, userId)`.
- Consumes: `tenantsTable`, `usersTable`.

- [ ] **Step 1: Create `tenantBlocks.ts`**

```ts
import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const tenantBlocksTable = pgTable(
  "tenant_blocks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    blockedByUserId: integer("blocked_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tenant_blocks_unique").on(table.tenantId, table.userId)],
);

export type TenantBlockRow = typeof tenantBlocksTable.$inferSelect;
export type InsertTenantBlock = typeof tenantBlocksTable.$inferInsert;
```

- [ ] **Step 2: Export from the barrel**

`lib/db/src/schema/index.ts`:

```ts
export * from "./users";
export * from "./tenants";
export * from "./reachNodes";
export * from "./reachEdges";
export * from "./tenantBlocks";
export * from "./messages";
export * from "./magicLinks";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/tenantBlocks.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add tenant_blocks table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Extend `messages` with tenant scoping, link URL, and node attachment

**Files:**
- Modify: `lib/db/src/schema/messages.ts`

**Interfaces:**
- Produces (updated): `messagesTable` gains `tenantId` (NOT NULL, FK → tenants), `url` (nullable, for `type:'link'`), `nodeId` (nullable, FK → reach_nodes, on delete set null). `MessageRow` / `InsertMessage` types update automatically.
- Consumes: `tenantsTable`, `reachNodesTable`.

- [ ] **Step 1: Replace `messages.ts` with the extended schema**

```ts
import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { reachNodesTable } from "./reachNodes";

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    userId: integer("user_id"),
    type: text("type").notNull(), // 'card' | 'video' | 'link'
    body: text("body"),
    url: text("url"), // target for type: 'link'
    authorName: text("author_name").notNull(),
    relationship: text("relationship"),
    location: text("location"),
    videoPath: text("video_path"),
    photoPath: text("photo_path"),
    nodeId: integer("node_id").references(() => reachNodesTable.id, {
      onDelete: "set null",
    }),
    card: jsonb("card"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_tenant_id_idx").on(table.tenantId)],
);

export type MessageRow = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: PASS at the `lib/*` level. (Note: `artifacts/api-server` route code that inserts into `messages` will not yet pass a `tenantId` — that is corrected in the tenancy/tributes milestones and is out of scope here. `typecheck:libs` does not compile artifacts, so it stays green.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/messages.ts
git commit -m "feat(db): add tenant_id, url, node_id to messages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Extend `magic_links` with redirect target and request IP

**Files:**
- Modify: `lib/db/src/schema/magicLinks.ts`

**Interfaces:**
- Produces (updated): `magicLinksTable` gains `redirectTo` (nullable text — where `verify` sends the user) and `requestIp` (nullable text — for DB-backed rate limiting in the auth milestone). Drops the unused `boolean` import.

- [ ] **Step 1: Replace `magicLinks.ts`**

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const magicLinksTable = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  redirectTo: text("redirect_to"),
  requestIp: text("request_ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MagicLink = typeof magicLinksTable.$inferSelect;
export type InsertMagicLink = typeof magicLinksTable.$inferInsert;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/magicLinks.ts
git commit -m "feat(db): add redirect_to and request_ip to magic_links

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Provision `belovedfriend_db` and push the schema

> This is the one task that touches **live infrastructure** (the Netlify-managed Neon server). It creates the platform database and applies the full schema. Requires the `NETLIFY DB` connection string from `secret.txt`. If you are not ready to provision live, stop after Task 6 — Tasks 7–8 can run later without changing any code.

**Files:** none (infra + DB only)

- [ ] **Step 1: Create the `belovedfriend_db` database**

The `NETLIFY DB` string in `secret.txt` points at database `netlifydb`. Connect to it and create the platform database:

```bash
NETLIFY_DEFAULT_URL='<NETLIFY DB connection string from secret.txt>'   # ends in /netlifydb?sslmode=require
psql "$NETLIFY_DEFAULT_URL" -c "CREATE DATABASE belovedfriend_db;"
```

Expected: `CREATE DATABASE`. If it errors with "already exists", that is fine — continue. If it errors that the role lacks permission, note it and surface to the user (Neon owner roles normally have CREATEDB).

- [ ] **Step 2: Build the `belovedfriend_db` URL and push the schema**

Take the same connection string and swap the database name `netlifydb` → `belovedfriend_db`:

```bash
BELOVED_URL='<same NETLIFY DB string with /netlifydb replaced by /belovedfriend_db>'
DATABASE_URL="$BELOVED_URL" pnpm --filter @workspace/db run push
```

Expected: drizzle-kit reports creating tables `users, tenants, reach_nodes, reach_edges, tenant_blocks, messages, magic_links` with no destructive prompts. If drizzle-kit prompts interactively about a column, abort and review — a fresh DB should apply cleanly. Use `run push-force` only if push refuses on the empty DB.

- [ ] **Step 3: Verify the tables exist**

```bash
psql "$BELOVED_URL" -c "\dt"
```

Expected: all seven tables listed (`magic_links, messages, reach_edges, reach_nodes, tenant_blocks, tenants, users`).

- [ ] **Step 4: Spot-check key constraints**

```bash
psql "$BELOVED_URL" -c "\d messages" -c "\d reach_edges"
```

Expected: `messages.tenant_id` is `not null` with an FK to `tenants`; `messages_tenant_id_idx` present; `reach_edges_unique` unique constraint on `(tenant_id, source_node_id, target_node_id)` present. No commit (no tracked files changed).

---

### Task 8: Regenerate `db-export/schema.sql` from `belovedfriend_db`

Make the committed snapshot reflect the live platform schema.

**Files:**
- Modify: `db-export/schema.sql`

- [ ] **Step 1: Dump the new platform schema**

```bash
pg_dump --schema-only --no-owner --no-privileges "$BELOVED_URL" > db-export/schema.sql
```

Expected: file now contains all seven `CREATE TABLE` statements plus indexes/constraints.

- [ ] **Step 2: Verify no secret leaked**

```bash
grep -nE 'npg_|password|neon.tech' db-export/schema.sql || echo "clean — no credentials in dump"
```

Expected: `clean — no credentials in dump`.

- [ ] **Step 3: Confirm the seven tables are present**

```bash
grep -c 'CREATE TABLE' db-export/schema.sql
```

Expected: `7`.

- [ ] **Step 4: Commit**

```bash
git add db-export/schema.sql
git commit -m "chore: regenerate schema.sql from belovedfriend_db (platform schema)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (spec §4, §16.1):**
- §4.1 tenants → Task 2 ✓
- §4.2 reach_nodes → Task 3 ✓
- §4.3 reach_edges → Task 3 ✓
- §4.4 tenant_blocks → Task 4 ✓
- §4.5 messages (tenant_id, type'link', url, node_id) → Task 5 ✓ (`type` stays a plain text column, so widening the union needs no DB change)
- §4.5 magic_links (redirect_to) + §4.6 (request_ip) → Task 6 ✓
- §16.1 refresh schema.sql from LUIS → Task 1 ✓
- Provision belovedfriend_db + apply schema (§15) → Tasks 7–8 ✓

**Deliberately deferred (not gaps):** the DB-backed rate-limit *query logic* (§4.6) and the per-tenant authorization helpers move to the auth milestone where the route exists and is verifiable; this milestone only adds the `request_ip` column they need. Indexes are created inline with their tables.

**Placeholder scan:** the only bracketed `<...>` tokens are connection strings intentionally externalized to `secret.txt` (never committed). All code blocks are complete.

**Type consistency:** new types use the `*Row` / `Insert*` convention; `ReachNodeRow` avoids the generated `ReachNode` name; FK reference thunks (`() => table.id`) and the array-return table-extras form match drizzle-orm 0.45.
