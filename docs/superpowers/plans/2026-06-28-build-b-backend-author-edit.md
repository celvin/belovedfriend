# Build-B Backend: Author Edit/Delete Own Tributes

> **For agentic workers:** This is a direct implementation spec, not a full plan file.

**Goal:** Allow a tribute's author to edit/delete their own tribute (currently only owner/admin can).

**Architecture:** Add `isOwnerOrAdmin` helper to tenancy.ts; change PATCH/DELETE message routes from `requireOwner` middleware to `requireAuth` + inline author-or-owner check; extend `MessageUpdate` schema in openapi.yaml to accept `card` and `url`; run codegen; update PATCH handler to apply card/url patch fields.

**Tech Stack:** Express 5, Drizzle ORM, Zod (via orval codegen), OpenAPI 3.1

## Global Constraints

- pnpm only (no npm, no yarn)
- NO tests — no test suite exists in this repo
- NEVER hand-edit src/generated/ — always run codegen
- Two commits required: (1) openapi + generated files; (2) routes/tenancy changes
- Both commits need Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
- Commit 1 message: `feat(api-spec): allow card/url in message update`
- Commit 2 message: `feat(api): authors can edit/delete their own tributes`
- Verify: codegen green, `pnpm --filter @workspace/api-server run typecheck` GREEN, `pnpm run typecheck:libs` PASS

---

## Task 1: Extend MessageUpdate schema + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (MessageUpdate schema, line ~673-680)
- Generated (do not hand-edit): `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/`

**Steps:**

- [ ] Edit `lib/api-spec/openapi.yaml`: In `MessageUpdate` schema (currently only has body/authorName/relationship/location), add two optional properties:
  ```yaml
  MessageUpdate:
    type: object
    description: Admin patch payload — all fields optional
    properties:
      body: { type: ["string", "null"] }
      authorName: { type: string }
      relationship: { type: ["string", "null"] }
      location: { type: ["string", "null"] }
      card:
        type: object
        additionalProperties: true
      url: { type: string }
  ```
  (Note: `card` uses `type: object, additionalProperties: true` — not a $ref — because authors edit their own card data which may vary by template. `url` is a plain string.)

- [ ] Run codegen:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
  This regenerates `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`, and runs `typecheck:libs` automatically.

- [ ] Run additional typecheck to confirm libs pass:
  ```bash
  pnpm run typecheck:libs
  ```
  Expected: PASS with no errors.

- [ ] Commit ONLY the openapi.yaml change and the generated files (do not include tenancy.ts or messages.ts changes yet):
  ```bash
  git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated/ lib/api-zod/src/generated/
  git commit -m "$(cat <<'COMMIT'
feat(api-spec): allow card/url in message update

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
COMMIT
)"
  ```

---

## Task 2: tenancy.ts — export isOwnerOrAdmin helper

**Files:**
- Modify: `artifacts/api-server/src/lib/tenancy.ts`

**Current state (line 86-93):**
```typescript
async function isSuperAdmin(userId: number): Promise<boolean> {
  const rows = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0]?.role === "admin";
}
```

**Steps:**

- [ ] In `artifacts/api-server/src/lib/tenancy.ts`, keep `isSuperAdmin` but change it to be used by the new exported helper. Add the exported function after `isSuperAdmin`:
  ```typescript
  export async function isOwnerOrAdmin(tenant: TenantRow, userId: number): Promise<boolean> {
    if (tenant.ownerUserId === userId) return true;
    return isSuperAdmin(userId);
  }
  ```
  (`TenantRow` is already imported from `@workspace/db/schema` at line 5.)

---

## Task 3: messages.ts — PATCH and DELETE use requireAuth + author-or-owner check

**Files:**
- Modify: `artifacts/api-server/src/routes/messages.ts`

**Current import line 15:**
```typescript
import { resolveTenant, isBlocked, requireOwner, getTenantFromReq } from "../lib/tenancy";
```

**Steps:**

- [ ] Update import in `artifacts/api-server/src/routes/messages.ts` to add `isOwnerOrAdmin`, remove `requireOwner` (no longer needed in this file) and `getTenantFromReq` (no longer needed either):
  ```typescript
  import { resolveTenant, isBlocked, isOwnerOrAdmin } from "../lib/tenancy";
  ```

- [ ] Replace the PATCH handler (currently starts at line 256 with `router.patch("/t/:slug/messages/:id", requireOwner, ...`). The new handler:
  ```typescript
  // PATCH /t/:slug/messages/:id
  router.patch("/t/:slug/messages/:id", requireAuth, async (req: Request, res: Response) => {
    const paramsParsed = UpdateMessageParams.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const bodyParsed = UpdateMessageBody.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid update" });
      return;
    }
    const tenant = await resolveTenant(paramsParsed.data.slug);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const sess = getSession(req)!;
    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.id, paramsParsed.data.id), eq(messagesTable.tenantId, tenant.id)))
      .limit(1);
    const message = rows[0];
    if (!message) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const authorized = message.userId === sess.uid || await isOwnerOrAdmin(tenant, sess.uid);
    if (!authorized) {
      res.status(403).json({ error: "You cannot edit this tribute" });
      return;
    }
    const patch: Partial<typeof messagesTable.$inferInsert> = {};
    const d = bodyParsed.data;
    if (d.body !== undefined) patch.body = d.body;
    if (d.authorName !== undefined) patch.authorName = d.authorName;
    if (d.relationship !== undefined) patch.relationship = d.relationship;
    if (d.location !== undefined) patch.location = d.location;
    if (d.card !== undefined) patch.card = d.card;
    if (d.url !== undefined) patch.url = d.url;
    try {
      const updated = await db
        .update(messagesTable)
        .set(patch)
        .where(and(eq(messagesTable.id, paramsParsed.data.id), eq(messagesTable.tenantId, tenant.id)))
        .returning();
      const row = updated[0];
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(serialize(row));
    } catch (err) {
      req.log.error({ err }, "updateMessage error");
      res.status(500).json({ error: "Something went wrong" });
    }
  });
  ```
  Note: the DB fetch for auth is separate from the DB update — the message must exist AND belong to this tenant before we check authorization.

- [ ] Replace the DELETE handler (currently starts at line 297 with `router.delete("/t/:slug/messages/:id", requireOwner, ...`). The new handler:
  ```typescript
  // DELETE /t/:slug/messages/:id
  router.delete("/t/:slug/messages/:id", requireAuth, async (req: Request, res: Response) => {
    const parsed = DeleteMessageParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const tenant = await resolveTenant(parsed.data.slug);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const sess = getSession(req)!;
    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.id, parsed.data.id), eq(messagesTable.tenantId, tenant.id)))
      .limit(1);
    const message = rows[0];
    if (!message) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const authorized = message.userId === sess.uid || await isOwnerOrAdmin(tenant, sess.uid);
    if (!authorized) {
      res.status(403).json({ error: "You cannot delete this tribute" });
      return;
    }
    try {
      const deleted = await db
        .delete(messagesTable)
        .where(and(eq(messagesTable.id, parsed.data.id), eq(messagesTable.tenantId, tenant.id)))
        .returning();
      const row = deleted[0];
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const cardPhoto =
        row.card && typeof row.card === "object" && "photoPath" in row.card
          ? ((row.card as { photoPath?: string | null }).photoPath ?? null)
          : null;
      await Promise.all([
        tryDeleteObject(row.videoPath, req.log),
        tryDeleteObject(row.photoPath, req.log),
        tryDeleteObject(cardPhoto, req.log),
      ]);
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "deleteMessage error");
      res.status(500).json({ error: "Something went wrong" });
    }
  });
  ```

- [ ] Run api-server typecheck:
  ```bash
  pnpm --filter @workspace/api-server run typecheck
  ```
  Expected: GREEN (0 errors).

- [ ] Commit tenancy.ts and messages.ts changes:
  ```bash
  git add artifacts/api-server/src/lib/tenancy.ts artifacts/api-server/src/routes/messages.ts
  git commit -m "$(cat <<'COMMIT'
feat(api): authors can edit/delete their own tributes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
COMMIT
)"
  ```

---

## Report

Write your report to: `/Users/celvinrivas/Projects/belovedfriend.org/.superpowers/sdd/build-b-backend-report.md`

Include:
- The `isOwnerOrAdmin` helper signature and body (as implemented)
- The author-or-owner authorization check pattern in PATCH/DELETE
- The card/url additions to openapi.yaml MessageUpdate
- The generated Zod validator name(s) for the update body
- Typecheck results (codegen, api-server, typecheck:libs)
- Any concerns

Then return ONLY (under 15 lines):
- Status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
- The 2 commit SHAs
- One-line verification: codegen + api-server typecheck GREEN? author-or-owner check on fetched row (not params)?
- Concerns (if any)
- Report path
