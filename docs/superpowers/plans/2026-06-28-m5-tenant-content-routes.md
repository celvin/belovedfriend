# Milestone 5: Tenant-Scoped Content Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Move tributes and the reach/memory graph under `/api/t/:slug/...`, scoped to a tenant, with not-blocked enforcement and owner-only link creation — and make the reach graph DB-backed (replacing the static `reach.ts`). This makes the api-server compile green (resolves the `messages.tenant_id` debt).

**Architecture:** Both routers resolve the tenant from `:slug` (404 if missing), filter every query by `tenant_id`, and use the M3 tenancy helpers (`resolveTenant`, `isBlocked`, `requireOwner`). Operation IDs are kept (`listMessages`, `createMessage`, …) so generated hook names stay stable — only a `slug` path param is added. The reach route reads/writes `reach_nodes`/`reach_edges` and computes a derived summary.

**Tech Stack:** Express, Drizzle, orval/Zod codegen, M1 tables, M3 tenancy lib.

Milestone 5 of [the spec](../specs/2026-06-28-multi-tenant-tribute-platform-design.md) (§9, §10). After this, the **api-server typecheck is green**; the **frontend** typecheck goes red until the frontend-rebuild milestone updates call sites (expected).

## Global Constraints

- **pnpm only; no tests; no secrets.** Verification: `pnpm --filter @workspace/api-spec run codegen`, `pnpm run typecheck:libs`, `pnpm --filter @workspace/api-server run typecheck` (MUST be green after Task 2+3 — no remaining errors).
- **Codegen workflow**; never hand-edit `src/generated/`.
- **Keep operationIds** (`listMessages`, `createMessage`, `getMessage`, `updateMessage`, `deleteMessage`, `getMessageStats`, plus new reach ops) so hook names stay stable; just add the `{slug}` path param.
- **Authorization:** reads are public (tenant must exist); `POST messages` (card/video) requires auth + not-blocked; `POST messages` with `type:'link'` requires owner/super-admin; `PATCH`/`DELETE messages` require owner/super-admin (was global admin). `POST reach/nodes|edges` require auth + not-blocked; `DELETE reach/...` require owner/super-admin.
- **Cross-tenant edge guard:** a reach edge's `sourceNodeId`/`targetNodeId` must both belong to the edge's tenant (validate before insert).
- Storage routes are unchanged in this milestone (GCS; the Blobs migration is a separate milestone).

---

### Task 1: openapi contract + codegen (tenant-scoped messages + reach)

**Files:** Modify `lib/api-spec/openapi.yaml`; regenerate.

- [ ] **Step 1.** Read `openapi.yaml`. Move the message paths under the slug prefix and add reach:
  - `/messages` → `/t/{slug}/messages` (operationId `listMessages`, `createMessage`); `/messages/{id}` → `/t/{slug}/messages/{id}` (`getMessage`, `updateMessage`, `deleteMessage`); `/messages/stats` → `/t/{slug}/messages/stats` (`getMessageStats`). Add `slug` path param (string) to each.
  - Extend `CreateMessageBody`: add optional `url` (string) and `nodeId` (integer). Extend the `Message` schema: add `url` (nullable string) and `nodeId` (nullable integer). Widen message `type` enum to `card | video | link`.
  - Remove `/reach/nodes`. Add: `GET /t/{slug}/reach` (operationId `getReach`) → `ReachGraph`; `POST /t/{slug}/reach/nodes` (`createReachNode`, body `CreateReachNodeBody`) → `ReachNode`; `POST /t/{slug}/reach/edges` (`createReachEdge`, body `CreateReachEdgeBody`) → `ReachEdge`; `DELETE /t/{slug}/reach/nodes/{id}` (`deleteReachNode`); `DELETE /t/{slug}/reach/edges/{id}` (`deleteReachEdge`).
  - New schemas: `ReachNode` `{ id:int, label:string, category:string, lat?:number, lng?:number, note?:string, isAnchor:boolean, createdAt:string }`; `ReachEdge` `{ id:int, sourceNodeId:int, targetNodeId:int }`; `ReachGraph` `{ nodes: ReachNode[], edges: ReachEdge[], summary: object }` (summary as `type: object, additionalProperties: true`); `CreateReachNodeBody` `{ label:string, category:string, lat?:number, lng?:number, note?:string }`; `CreateReachEdgeBody` `{ sourceNodeId:int, targetNodeId:int }`.

- [ ] **Step 2.** `pnpm --filter @workspace/api-spec run codegen` → must end with `typecheck:libs` passing. (The generated Zod body validators will be `CreateMessageBody`, `CreateReachNodeBody`, `CreateReachEdgeBody`; note any orval rename like in M3 and report it.)

- [ ] **Step 3.** Commit `openapi.yaml` + both `src/generated` dirs:
  `feat(api-spec): tenant-scoped messages + reach graph contract`

---

### Task 2: Tenant-scoped messages route (fixes compile)

**Files:** Modify `artifacts/api-server/src/routes/messages.ts`.

- [ ] **Step 1.** Rewrite the handlers to be tenant-scoped. For each, read `req.params.slug`, `const tenant = await resolveTenant(slug)`, 404 if `!tenant`, and filter all queries by `eq(messagesTable.tenantId, tenant.id)`. Keep the existing `serialize` shape but add `url` and `nodeId`.
  - `GET /t/:slug/messages` (was `/messages`): filter by tenant_id (+ type).
  - `GET /t/:slug/messages/stats`: aggregate over tenant_id only.
  - `GET /t/:slug/messages/:id`: fetch by id AND tenant_id (404 otherwise).
  - `POST /t/:slug/messages` (requireAuth): resolve tenant; `if (await isBlocked(tenant.id, sess.uid)) → 403`; if `data.type === "link"` require owner/super-admin (reuse the `requireOwner`-style check inline, or check `tenant.ownerUserId === sess.uid || isSuperAdmin`); video requires `videoPath`; insert with `tenantId: tenant.id`, `userId: sess.uid`, `url`, `nodeId`.
  - `PATCH /t/:slug/messages/:id` and `DELETE /t/:slug/messages/:id`: replace `requireAdmin` with `requireOwner` (per-tenant); scope the update/delete by tenant_id; keep the media-cleanup logic on delete.
- [ ] **Step 2.** `pnpm --filter @workspace/api-server run typecheck` → **GREEN (no errors)**. `pnpm run typecheck:libs` PASS.
- [ ] **Step 3.** Commit: `feat(api): tenant-scoped tributes (messages) + links + node attach`

---

### Task 3: Tenant-scoped, DB-backed reach route

**Files:** Replace `artifacts/api-server/src/routes/reach.ts` (drop the static node/edge data).

- [ ] **Step 1.** New handlers:
  - `GET /t/:slug/reach`: resolve tenant (404); load `reach_nodes`/`reach_edges` by tenant_id; return `{ nodes, edges, summary }` where summary = `{ nodeCount, placeCount (nodes with lat&lng), contributorCount (distinct created_by_user_id), edgeCount }` (countryCount is not derivable without country data — omit it; the frontend tolerates missing keys).
  - `POST /t/:slug/reach/nodes` (requireAuth): not-blocked check; insert node with `tenantId`, `createdByUserId: sess.uid`, label/category/lat/lng/note; then if an anchor node exists for the tenant, insert an edge (anchor → new node) so contributions connect to the friend (auto-connect, spec §10). Return the node.
  - `POST /t/:slug/reach/edges` (requireAuth): not-blocked; **validate both nodes exist AND belong to tenant.id** (query reach_nodes by id+tenant); 422 if not; insert edge; ignore duplicate (unique constraint) gracefully (catch 23505 → return existing/204).
  - `DELETE /t/:slug/reach/nodes/:id` (requireOwner): delete node by id+tenant (DB cascades edges; sets messages.node_id null).
  - `DELETE /t/:slug/reach/edges/:id` (requireOwner): delete edge by id+tenant.
- [ ] **Step 2.** `pnpm --filter @workspace/api-server run typecheck` GREEN; `typecheck:libs` PASS. (The router mount in `routes/index.ts` already includes `reachRouter`; keep it.)
- [ ] **Step 3.** Commit: `feat(api): DB-backed tenant-scoped reach graph (nodes/edges + auto-connect)`

---

## Self-Review

**Spec coverage:** messages tenant-scoped (§9) ✓; Links owner-only (§9) ✓; node attach via nodeId (§10) ✓; reach DB-backed + visitor nodes/edges + auto-connect to anchor (§10) ✓; not-blocked enforcement (§11) ✓; owner moderation via requireOwner (§11) ✓; cross-tenant edge guard (M3 review follow-on) ✓.

**Placeholder scan:** the route bodies are described as adaptations of the existing handlers (which the implementer reads) plus the exact tenant-scoping/auth logic — concrete enough; codegen + green typecheck are the gates.

**Known limitation:** `countryCount` derived summary key is not computed (no country field on nodes); frontend handles its absence. Recorded as a follow-on if needed.
