# Milestone 8: Moderation & Blocking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Let a page owner (and super-admin) **block a contributor's account** on their tenant (barring future posts/pins), list & unblock blocked accounts, and give the super-admin a tenant **suspend/reactivate** control. Fills the real gap: `isBlocked` is enforced on writes but nothing creates a block yet.

**Architecture:** A tenant-scoped `blocks` route (`requireOwner`) backed by `tenant_blocks`; a super-admin `PATCH /admin/tenants/:slug { status }`. `Message` gains `userId` so the manage UI can block a tribute's author. Frontend adds block/unblock to the manage page.

Milestone of the spec §11. Built blind (typecheck-gated); runtime verified at deploy.

## Global Constraints
- pnpm only; no tests; no secrets; no deploy. Gate: `pnpm --filter @workspace/api-spec run codegen`, `pnpm --filter @workspace/api-server run typecheck` GREEN, `pnpm run typecheck` GREEN.
- Codegen workflow; never hand-edit `src/generated/`.
- Authorization: blocks routes `requireOwner` (owner or super-admin); suspend route `requireSuperAdmin`.
- The blocked person's `userId` is exposed only on owner-scoped responses.

---

### Task 1: openapi + codegen
**Files:** `lib/api-spec/openapi.yaml` (+ regenerate).
- [ ] **Step 1.** Add `userId` (nullable integer) to the `Message` schema. Add schemas: `BlockedUser` `{ userId:int, email?:string, name?:string, createdAt:string }`; `CreateBlockBody` `{ userId:int }`; `AdminTenantUpdate` `{ status: enum[active,suspended] }`. Add paths:
  - `GET /t/{slug}/blocks` (op `listBlocks`) → array of `BlockedUser`
  - `POST /t/{slug}/blocks` (op `createBlock`, body `CreateBlockBody`) → 201 `BlockedUser`
  - `DELETE /t/{slug}/blocks/{userId}` (op `deleteBlock`) → 200 `SimpleOk`
  - `PATCH /admin/tenants/{slug}` (op `adminUpdateTenant`, body `AdminTenantUpdate`) → 200 `Tenant`
- [ ] **Step 2.** `pnpm --filter @workspace/api-spec run codegen` → typecheck:libs green. Report the generated Zod body validator names (e.g. `CreateBlockBody`, `AdminTenantUpdate` may be renamed by orval — report actual names).
- [ ] **Step 3.** Commit openapi + generated: `feat(api-spec): blocks + admin suspend contract`

---

### Task 2: blocks route + admin suspend + messages.userId
**Files:** Create `artifacts/api-server/src/routes/blocks.ts`; modify `routes/index.ts`, `routes/messages.ts`, and add an admin route (in `blocks.ts` or a new `routes/admin.ts`).
- [ ] **Step 1.** `routes/blocks.ts` (read `tenancy.ts` + `messages.ts` for patterns):
  - `GET /t/:slug/blocks` (`requireOwner`): join `tenant_blocks` + `users` for the tenant; return `{ userId, email, name, createdAt }[]`.
  - `POST /t/:slug/blocks` (`requireOwner`, body `CreateBlockBody`): insert `tenant_blocks` `{ tenantId, userId, blockedByUserId: sess.uid }`; on duplicate (23505) treat as already-blocked (200). Return the blocked user.
  - `DELETE /t/:slug/blocks/:userId` (`requireOwner`): delete by `(tenantId, userId)`; 200 SimpleOk.
  - `PATCH /admin/tenants/:slug` (`requireSuperAdmin`, body validates status enum): update `tenants.status`; return the tenant (serialize like tenants.ts).
  Use `getTenantFromReq` after `requireOwner`. Mount `blocksRouter` in `routes/index.ts`.
- [ ] **Step 2.** In `routes/messages.ts` `serialize`, add `userId: row.userId`.
- [ ] **Step 3.** `pnpm --filter @workspace/api-server run typecheck` GREEN; `pnpm run typecheck:libs` PASS. Commit: `feat(api): tenant block/unblock routes + admin suspend + message userId`

---

### Task 3: Manage page block/unblock UI
**Files:** `artifacts/memorial/src/pages/manage.tsx`.
- [ ] **Step 1.** Add to the tributes list a **Block author** button (when `message.userId` present), calling `useCreateBlock` with `{ slug, data: { userId } }`; confirm dialog. Add a **Blocked accounts** section: `useListBlocks(slug)` (owner-only) listing email/name with an **Unblock** button (`useDeleteBlock` `{ slug, userId }`). Invalidate the blocks + messages queries on success. READ the generated hook names/shapes first.
- [ ] **Step 2.** `pnpm run typecheck` GREEN. Commit: `feat(web): block/unblock controls on the manage page`

---

## Self-Review
**Spec coverage (§11):** block an account (owner) ✓; unblock + list ✓; blocked users barred from posting (enforcement already in M5 via `isBlocked`) ✓; super-admin suspend ✓; message `userId` for targeting ✓.
**Placeholder scan:** none — routes + UI specified; codegen + green typecheck are the gates.
