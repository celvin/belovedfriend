# Milestone 3: Tenancy Core (backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add the backend tenancy foundation — a tenant API (claim / get / list / availability / edit / mine) plus a tenancy library (slug rules, reserved slugs, default `page_config`, tenant resolution, owner/super-admin/block authorization helpers) — driven through the openapi→codegen pipeline and verified by `codegen` + `typecheck:libs`.

**Architecture:** `openapi.yaml` gains the tenant contract; orval regenerates the React Query hooks and Zod validators. A new `lib/tenancy.ts` holds pure rules + Express middleware. A new `routes/tenants.ts` implements the endpoints, using the generated Zod schemas for body validation and a hand-written `PageConfigSchema` for the `page_config` jsonb. Claiming a page atomically inserts the tenant (unique slug) and seeds an anchor reach node.

**Tech Stack:** Express 5, Drizzle, orval/Zod codegen, the M1 schema (`tenantsTable`, `reachNodesTable`, `tenantBlocksTable`).

This is Milestone 3 of [the spec](../specs/2026-06-28-multi-tenant-tribute-platform-design.md). Frontend claim form / dashboard UI come in a later (landing/dashboard) milestone; this milestone is backend + contract only.

## Global Constraints

- **pnpm only**, from repo root. **No automated tests** (owner decision) — verification is `pnpm --filter @workspace/api-spec run codegen` (which runs orval + `typecheck:libs`) and `pnpm run typecheck:libs`.
- **Codegen workflow is mandatory:** edit `lib/api-spec/openapi.yaml` → run codegen → update route handlers to import the regenerated Zod. NEVER hand-edit files under `src/generated/` (wiped by `clean: true`).
- **No secrets in git.**
- **Full-workspace `pnpm run typecheck` remains RED** (messages route still lacks `tenant_id`, fixed in M5). `typecheck:libs` MUST stay green. The new `tenants.ts` route must itself compile clean.
- **Slug rules (spec §5/§7):** `^[a-z0-9-]{3,40}$`, not in the reserved list. Claim is an **atomic insert** relying on the unique constraint (no check-then-insert race).
- **Roles:** owner = `tenants.owner_user_id`; super-admin = `users.role === 'admin'`. Authorization is per-request, per-tenant.
- **Reserved slugs:** `api, sign-in, signin, create, dashboard, admin, login, logout, www, about, pricing, terms, privacy, help, support, contact, static, assets, public, t`.
- Drizzle/import patterns follow the existing routes (`db`, schema tables from `@workspace/db`, `getSession`/`requireAuth` from `../lib/session`).

---

## File Structure

- Modify: `lib/api-spec/openapi.yaml` — add tenant schemas + paths.
- Regenerate: `lib/api-client-react/src/generated/**`, `lib/api-zod/src/generated/**` (via codegen — do not hand-edit).
- Create: `artifacts/api-server/src/lib/tenancy.ts` — slug rules, reserved list, default page_config, `PageConfigSchema`, `resolveTenant`, `requireOwner`, `requireSuperAdmin`, `isBlocked`.
- Create: `artifacts/api-server/src/routes/tenants.ts` — the tenant endpoints.
- Modify: `artifacts/api-server/src/routes/index.ts` — mount the tenants router.

---

### Task 1: Add the tenant contract to openapi.yaml + regenerate

**Files:** Modify `lib/api-spec/openapi.yaml`; regenerate via codegen.

**Interfaces (produced for later tasks/milestones — exact shapes):**
- `Tenant`: `{ id:int, slug:string, friendName:string, birthYear?:int, deathYear?:int, tagline?:string, status:'active'|'suspended', pageConfig:object, createdAt:string(date-time) }`
- `TenantSummary` (directory): `{ id:int, slug:string, friendName:string, tagline?:string }`
- `CreateTenantBody`: `{ slug:string, friendName:string, birthYear?:int, deathYear?:int, tagline?:string }`
- `UpdateTenantBody`: `{ friendName?:string, birthYear?:int, deathYear?:int, tagline?:string, pageConfig?:object }`
- `SlugAvailability`: `{ slug:string, available:boolean }`

- [ ] **Step 1: Add schemas + paths to `openapi.yaml`.** Read the existing file first and match its exact style (it already defines `/messages`, `Message`, etc.). Add under `components.schemas` the five schemas above (`pageConfig` typed as `type: object` with `additionalProperties: true`; `status` as `type: string, enum: [active, suspended]`; optional fields omitted from `required`). Add these paths:
  - `GET /tenants` → 200 `array` of `TenantSummary` (public directory of active tenants)
  - `POST /tenants` → 201 `Tenant` (claim; body `CreateTenantBody`); document 409 (slug taken), 422 (invalid/reserved slug)
  - `GET /tenants/mine` → 200 `array` of `Tenant` (caller's owned tenants)
  - `GET /tenants/{slug}` → 200 `Tenant`, 404
  - `GET /tenants/{slug}/availability` → 200 `SlugAvailability`
  - `PATCH /tenants/{slug}` → 200 `Tenant` (body `UpdateTenantBody`), 403, 404

  Order matters for routing later, but in openapi order is cosmetic. Use `operationId`s consistent with existing style (e.g. `listTenants`, `createTenant`, `listMyTenants`, `getTenant`, `checkSlugAvailability`, `updateTenant`).

- [ ] **Step 2: Regenerate client + Zod.**
  Run: `pnpm --filter @workspace/api-spec run codegen`
  Expected: orval writes `lib/api-client-react/src/generated/**` and `lib/api-zod/src/generated/**`, then `typecheck:libs` runs and PASSES. If codegen errors on the YAML, fix the spec. Confirm new exports exist:
  `grep -rl "CreateTenantBody\|getTenant\|listTenants" lib/api-zod/src/generated lib/api-client-react/src/generated | head`

- [ ] **Step 3: Commit** (include the regenerated files):
  ```bash
  git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated
  git commit -m "feat(api-spec): add tenant endpoints contract + regenerate client/zod

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2: Tenancy library (rules + middleware)

**Files:** Create `artifacts/api-server/src/lib/tenancy.ts`

**Interfaces (produced):**
- `SLUG_RE`, `RESERVED_SLUGS: Set<string>`, `isValidSlug(s): boolean`, `isReservedSlug(s): boolean`
- `defaultPageConfig(friendName: string): PageConfig` — the v1 `page_config` object (spec §8)
- `PageConfigSchema` (zod) + `type PageConfig`
- `resolveTenant(slug: string): Promise<TenantRow | null>`
- `requireOwner(req,res,next)` / `requireSuperAdmin(req,res,next)` — Express middleware reading the slug from `req.params.slug` and the session
- `isBlocked(tenantId: number, userId: number): Promise<boolean>`

- [ ] **Step 1: Write the library.** `artifacts/api-server/src/lib/tenancy.ts`:

```ts
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantsTable, tenantBlocksTable, usersTable, type TenantRow } from "@workspace/db/schema";
import { getSession } from "./session";

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export const RESERVED_SLUGS = new Set<string>([
  "api", "sign-in", "signin", "create", "dashboard", "admin", "login",
  "logout", "www", "about", "pricing", "terms", "privacy", "help",
  "support", "contact", "static", "assets", "public", "t",
]);

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// Versioned page configuration (spec §8). Stored in tenants.page_config (jsonb).
export const PageConfigSchema = z.object({
  version: z.literal(1),
  theme: z.object({
    palette: z.string().default("warm"),
    accent: z.string().default("#7a4a1f"),
    font: z.enum(["serif", "sans", "handwritten"]).default("serif"),
  }),
  hero: z.object({
    heroPhotoPath: z.string().nullable().default(null),
    showDates: z.boolean().default(true),
  }),
  story: z.object({
    enabled: z.boolean().default(true),
    blocks: z.array(z.object({ heading: z.string(), body: z.string() })).default([]),
  }),
  sections: z.object({
    order: z.array(z.enum(["story", "wall", "reach"])).default(["story", "wall", "reach"]),
    story: z.boolean().default(true),
    wall: z.boolean().default(true),
    reach: z.boolean().default(true),
  }),
  reachSummary: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]).optional(),
        derived: z.enum(["nodeCount", "placeCount", "contributorCount", "countryCount"]).optional(),
      }),
    )
    .default([]),
  cta: z.object({
    primaryLabel: z.string().default("Leave a tribute"),
    wallLabel: z.string().default("Read tributes"),
  }),
});

export type PageConfig = z.infer<typeof PageConfigSchema>;

export function defaultPageConfig(friendName: string): PageConfig {
  return PageConfigSchema.parse({
    version: 1,
    theme: { palette: "warm", accent: "#7a4a1f", font: "serif" },
    hero: { heroPhotoPath: null, showDates: true },
    story: {
      enabled: true,
      blocks: [{ heading: `Remembering ${friendName}`, body: "" }],
    },
    sections: { order: ["story", "wall", "reach"], story: true, wall: true, reach: true },
    reachSummary: [{ label: "Memories", derived: "nodeCount" }],
    cta: { primaryLabel: "Leave a tribute", wallLabel: "Read tributes" },
  });
}

export async function resolveTenant(slug: string): Promise<TenantRow | null> {
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

async function isSuperAdmin(userId: number): Promise<boolean> {
  const rows = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0]?.role === "admin";
}

export async function isBlocked(tenantId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: tenantBlocksTable.id })
    .from(tenantBlocksTable)
    .where(and(eq(tenantBlocksTable.tenantId, tenantId), eq(tenantBlocksTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Attaches the resolved tenant to req for downstream handlers.
type WithTenant = { tenant?: TenantRow };

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const sess = getSession(req);
  if (!sess) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const slug = req.params.slug;
  const tenant = await resolveTenant(slug ?? "");
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const owner = tenant.ownerUserId === sess.uid;
  const admin = await isSuperAdmin(sess.uid);
  if (!owner && !admin) {
    res.status(403).json({ error: "You do not manage this page" });
    return;
  }
  (req as Request & WithTenant).tenant = tenant;
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const sess = getSession(req);
  if (!sess) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await isSuperAdmin(sess.uid))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function getTenantFromReq(req: Request): TenantRow | null {
  return (req as Request & WithTenant).tenant ?? null;
}
```

- [ ] **Step 2: Typecheck.** Run: `pnpm run typecheck:libs` (PASS) and `pnpm --filter @workspace/api-server run typecheck 2>&1 | tail -20` (only the pre-existing `messages.ts` error should appear; `tenancy.ts` must be clean).
- [ ] **Step 3: Commit:**
  ```bash
  git add artifacts/api-server/src/lib/tenancy.ts
  git commit -m "feat(api): tenancy lib — slug rules, page_config schema, auth middleware

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3: Tenant routes + mount

**Files:** Create `artifacts/api-server/src/routes/tenants.ts`; modify `artifacts/api-server/src/routes/index.ts`.

**Interfaces (consumed):** generated Zod `CreateTenantBody`, `UpdateTenantBody` from `@workspace/api-zod`; `tenancy.ts` helpers; `tenantsTable`, `reachNodesTable` from `@workspace/db/schema`.

- [ ] **Step 1: Write `routes/tenants.ts`.** Read an existing route (e.g. `routes/messages.ts`) to match serialization/error style, then:

```ts
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { CreateTenantBody, UpdateTenantBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { tenantsTable, reachNodesTable, type TenantRow } from "@workspace/db/schema";
import { getSession, requireAuth } from "../lib/session";
import {
  isValidSlug, isReservedSlug, defaultPageConfig, resolveTenant,
  requireOwner, getTenantFromReq, PageConfigSchema,
} from "../lib/tenancy";

const router: IRouter = Router();

function serialize(t: TenantRow) {
  return {
    id: t.id, slug: t.slug, friendName: t.friendName,
    birthYear: t.birthYear, deathYear: t.deathYear, tagline: t.tagline,
    status: t.status as "active" | "suspended",
    pageConfig: t.pageConfig, createdAt: t.createdAt.toISOString(),
  };
}
function summarize(t: TenantRow) {
  return { id: t.id, slug: t.slug, friendName: t.friendName, tagline: t.tagline };
}

// Public directory of active tenants.
router.get("/tenants", async (_req: Request, res: Response) => {
  const rows = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.status, "active"))
    .orderBy(desc(tenantsTable.createdAt));
  res.json(rows.map(summarize));
});

// Tenants owned by the caller. MUST be registered before "/tenants/:slug".
router.get("/tenants/mine", requireAuth, async (req: Request, res: Response) => {
  const sess = getSession(req)!;
  const rows = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.ownerUserId, sess.uid))
    .orderBy(desc(tenantsTable.createdAt));
  res.json(rows.map(serialize));
});

router.get("/tenants/:slug/availability", async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").toLowerCase();
  const available = isValidSlug(slug) && !isReservedSlug(slug) && !(await resolveTenant(slug));
  res.json({ slug, available });
});

router.get("/tenants/:slug", async (req: Request, res: Response) => {
  const tenant = await resolveTenant(req.params.slug ?? "");
  if (!tenant) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(tenant));
});

router.post("/tenants", requireAuth, async (req: Request, res: Response) => {
  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const slug = parsed.data.slug.toLowerCase().trim();
  if (!isValidSlug(slug) || isReservedSlug(slug)) {
    res.status(422).json({ error: "That address is not available. Use 3–40 lowercase letters, numbers, or hyphens." });
    return;
  }
  const sess = getSession(req)!;
  const friendName = parsed.data.friendName.trim();
  try {
    const inserted = await db.insert(tenantsTable).values({
      slug, friendName,
      birthYear: parsed.data.birthYear ?? null,
      deathYear: parsed.data.deathYear ?? null,
      tagline: parsed.data.tagline?.trim() ?? null,
      ownerUserId: sess.uid,
      status: "active",
      pageConfig: defaultPageConfig(friendName),
    }).returning();
    const tenant = inserted[0]!;
    // Seed the anchor reach node (the friend) for the memory map.
    await db.insert(reachNodesTable).values({
      tenantId: tenant.id, label: friendName, category: "person",
      isAnchor: true, createdByUserId: sess.uid,
    });
    res.status(201).json(serialize(tenant));
  } catch (err: unknown) {
    // Unique violation on slug → already taken.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That address is already taken." });
      return;
    }
    req.log.error({ err }, "createTenant error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.patch("/tenants/:slug", requireOwner, async (req: Request, res: Response) => {
  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid update" }); return; }
  const tenant = getTenantFromReq(req)!;
  const patch: Partial<typeof tenantsTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.friendName !== undefined) patch.friendName = d.friendName;
  if (d.birthYear !== undefined) patch.birthYear = d.birthYear;
  if (d.deathYear !== undefined) patch.deathYear = d.deathYear;
  if (d.tagline !== undefined) patch.tagline = d.tagline;
  if (d.pageConfig !== undefined) {
    const pc = PageConfigSchema.safeParse(d.pageConfig);
    if (!pc.success) { res.status(422).json({ error: "Invalid page configuration" }); return; }
    patch.pageConfig = pc.data;
  }
  const updated = await db.update(tenantsTable).set(patch)
    .where(eq(tenantsTable.id, tenant.id)).returning();
  res.json(serialize(updated[0]!));
});

export default router;
```

- [ ] **Step 2: Mount the router.** In `artifacts/api-server/src/routes/index.ts`, import `tenantsRouter from "./tenants"` and add `router.use(tenantsRouter);` (place it before `messagesRouter` for clarity; route order within the file doesn't conflict since paths differ).

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter @workspace/api-server run typecheck 2>&1 | tail -20`
  Expected: `tenants.ts` and `index.ts` compile clean; ONLY the pre-existing `messages.ts` `tenant_id` error remains. `pnpm run typecheck:libs` PASS.

- [ ] **Step 4: Commit:**
  ```bash
  git add artifacts/api-server/src/routes/tenants.ts artifacts/api-server/src/routes/index.ts
  git commit -m "feat(api): tenant routes — claim, get, list, availability, edit, mine

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-Review

**Spec coverage:** tenant claim (§7, atomic insert + 409) ✓; reserved slugs (§5) ✓; default page_config (§8) ✓; anchor reach node seeded on claim (§10) ✓; owner/super-admin authorization (§3) ✓; block helper (§11, used in M5) ✓; directory + mine for dashboard (§12) ✓; PATCH page_config with validation (§8) ✓.

**Placeholder scan:** none — all code is concrete; openapi YAML is specified as an exact contract for the implementer to render in the file's style + verified by codegen.

**Type consistency:** `serialize`/`summarize` match the openapi `Tenant`/`TenantSummary` shapes; `PageConfigSchema` is the single source for both default and validation; `requireOwner` attaches `tenant` consumed via `getTenantFromReq`; status enum matches the M3 follow-on note from M1.

**Deferred:** frontend claim form + dashboard UI → landing/dashboard milestone. `messages` tenant-scoping → M5 (still red until then).
