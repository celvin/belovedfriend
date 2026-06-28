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
  const slug = (String(req.params.slug ?? "")).toLowerCase();
  const available = isValidSlug(slug) && !isReservedSlug(slug) && !(await resolveTenant(slug));
  res.json({ slug, available });
});

router.get("/tenants/:slug", async (req: Request, res: Response) => {
  const tenant = await resolveTenant(String(req.params.slug ?? ""));
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
