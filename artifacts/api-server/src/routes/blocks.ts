import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateBlockBody,
  DeleteBlockParams,
  AdminUpdateTenantBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  tenantBlocksTable,
  tenantsTable,
  usersTable,
  type TenantRow,
} from "@workspace/db/schema";
import { getSession } from "../lib/session";
import {
  requireOwner,
  requireSuperAdmin,
  getTenantFromReq,
  resolveTenant,
} from "../lib/tenancy";

const router: IRouter = Router();

// Serialize a tenant to match tenants.ts shape
function serializeTenant(t: TenantRow) {
  return {
    id: t.id,
    slug: t.slug,
    friendName: t.friendName,
    birthYear: t.birthYear,
    deathYear: t.deathYear,
    tagline: t.tagline,
    status: t.status as "active" | "suspended",
    pageConfig: t.pageConfig,
    createdAt: t.createdAt.toISOString(),
  };
}

// GET /t/:slug/blocks — list blocked users for this tenant (requireOwner)
router.get("/t/:slug/blocks", requireOwner, async (req: Request, res: Response) => {
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const rows = await db
      .select({
        userId: tenantBlocksTable.userId,
        email: usersTable.email,
        name: usersTable.name,
        createdAt: tenantBlocksTable.createdAt,
      })
      .from(tenantBlocksTable)
      .innerJoin(usersTable, eq(tenantBlocksTable.userId, usersTable.id))
      .where(eq(tenantBlocksTable.tenantId, tenant.id));

    res.json(
      rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "listBlocks error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /t/:slug/blocks — block a user (requireOwner)
router.post("/t/:slug/blocks", requireOwner, async (req: Request, res: Response) => {
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const parsed = CreateBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const sess = getSession(req)!;
  const { userId } = parsed.data;

  // Fetch the blocked user's info for the response
  async function getBlockedUser() {
    const userRows = await db
      .select({
        userId: tenantBlocksTable.userId,
        email: usersTable.email,
        name: usersTable.name,
        createdAt: tenantBlocksTable.createdAt,
      })
      .from(tenantBlocksTable)
      .innerJoin(usersTable, eq(tenantBlocksTable.userId, usersTable.id))
      .where(
        and(
          eq(tenantBlocksTable.tenantId, tenant!.id),
          eq(tenantBlocksTable.userId, userId),
        ),
      )
      .limit(1);
    return userRows[0] ?? null;
  }

  try {
    await db.insert(tenantBlocksTable).values({
      tenantId: tenant.id,
      userId,
      blockedByUserId: sess.uid,
    });
    const blocked = await getBlockedUser();
    if (!blocked) {
      res.status(500).json({ error: "Something went wrong" });
      return;
    }
    res.status(201).json({
      userId: blocked.userId,
      email: blocked.email,
      name: blocked.name,
      createdAt: blocked.createdAt.toISOString(),
    });
  } catch (err: unknown) {
    // PG unique violation = already blocked; return 200 with existing record
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      const blocked = await getBlockedUser();
      if (!blocked) {
        res.status(500).json({ error: "Something went wrong" });
        return;
      }
      res.status(200).json({
        userId: blocked.userId,
        email: blocked.email,
        name: blocked.name,
        createdAt: blocked.createdAt.toISOString(),
      });
      return;
    }
    req.log.error({ err }, "createBlock error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /t/:slug/blocks/:userId — unblock a user (requireOwner)
router.delete("/t/:slug/blocks/:userId", requireOwner, async (req: Request, res: Response) => {
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const parsed = DeleteBlockParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    await db
      .delete(tenantBlocksTable)
      .where(
        and(
          eq(tenantBlocksTable.tenantId, tenant.id),
          eq(tenantBlocksTable.userId, parsed.data.userId),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "deleteBlock error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// PATCH /admin/tenants/:slug — super-admin suspend/reactivate
router.patch(
  "/admin/tenants/:slug",
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? "");
    const tenant = await resolveTenant(slug);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const parsed = AdminUpdateTenantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      const updated = await db
        .update(tenantsTable)
        .set({ status: parsed.data.status })
        .where(eq(tenantsTable.id, tenant.id))
        .returning();
      res.json(serializeTenant(updated[0]!));
    } catch (err) {
      req.log.error({ err }, "adminUpdateTenant error");
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

export default router;
