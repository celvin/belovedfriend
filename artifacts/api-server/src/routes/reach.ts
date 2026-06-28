import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  GetReachParams,
  CreateReachNodeParams,
  CreateReachNodeBody,
  CreateReachEdgeParams,
  CreateReachEdgeBody,
  DeleteReachNodeParams,
  DeleteReachEdgeParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { reachNodesTable, reachEdgesTable, type ReachNodeRow, type ReachEdgeRow } from "@workspace/db/schema";
import { getSession, requireAuth } from "../lib/session";
import { resolveTenant, isBlocked, requireOwner, getTenantFromReq } from "../lib/tenancy";

const router: IRouter = Router();

function serializeNode(row: ReachNodeRow) {
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    note: row.note ?? undefined,
    isAnchor: row.isAnchor,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeEdge(row: ReachEdgeRow) {
  return {
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
  };
}

// GET /t/:slug/reach
router.get("/t/:slug/reach", async (req: Request, res: Response) => {
  const parsed = GetReachParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(parsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const nodes = await db
      .select()
      .from(reachNodesTable)
      .where(eq(reachNodesTable.tenantId, tenant.id));
    const edges = await db
      .select()
      .from(reachEdgesTable)
      .where(eq(reachEdgesTable.tenantId, tenant.id));

    const nodeCount = nodes.length;
    const placeCount = nodes.filter((n) => n.lat != null && n.lng != null).length;
    const edgeCount = edges.length;
    const contributorCount = new Set(
      nodes
        .map((n) => n.createdByUserId)
        .filter((id): id is number => id != null),
    ).size;

    res.json({
      nodes: nodes.map(serializeNode),
      edges: edges.map(serializeEdge),
      summary: { nodeCount, placeCount, contributorCount, edgeCount },
    });
  } catch (err) {
    req.log.error({ err }, "getReach error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /t/:slug/reach/nodes
router.post("/t/:slug/reach/nodes", requireAuth, async (req: Request, res: Response) => {
  const paramsParsed = CreateReachNodeParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(paramsParsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const sess = getSession(req)!;
  if (await isBlocked(tenant.id, sess.uid)) {
    res.status(403).json({ error: "You are blocked from contributing to this page" });
    return;
  }
  const bodyParsed = CreateReachNodeBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid node data" });
    return;
  }
  const data = bodyParsed.data;
  try {
    const inserted = await db
      .insert(reachNodesTable)
      .values({
        tenantId: tenant.id,
        createdByUserId: sess.uid,
        label: data.label,
        category: data.category,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        note: data.note ?? null,
        isAnchor: false,
      })
      .returning();
    const newNode = inserted[0]!;

    // Auto-connect: if an anchor node exists for this tenant, create edge anchor → newNode
    const anchors = await db
      .select()
      .from(reachNodesTable)
      .where(and(eq(reachNodesTable.tenantId, tenant.id), eq(reachNodesTable.isAnchor, true)))
      .limit(1);
    const anchor = anchors[0];
    if (anchor) {
      try {
        await db.insert(reachEdgesTable).values({
          tenantId: tenant.id,
          sourceNodeId: anchor.id,
          targetNodeId: newNode.id,
          createdByUserId: sess.uid,
        });
      } catch (edgeErr: unknown) {
        // Ignore duplicate edge (unique constraint violation 23505)
        const pgCode = (edgeErr as { code?: string })?.code;
        if (pgCode !== "23505") {
          req.log.warn({ edgeErr }, "auto-connect edge insert failed");
        }
      }
    }

    res.status(201).json(serializeNode(newNode));
  } catch (err) {
    req.log.error({ err }, "createReachNode error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /t/:slug/reach/edges
router.post("/t/:slug/reach/edges", requireAuth, async (req: Request, res: Response) => {
  const paramsParsed = CreateReachEdgeParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(paramsParsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const sess = getSession(req)!;
  if (await isBlocked(tenant.id, sess.uid)) {
    res.status(403).json({ error: "You are blocked from contributing to this page" });
    return;
  }
  const bodyParsed = CreateReachEdgeBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid edge data" });
    return;
  }
  const { sourceNodeId, targetNodeId } = bodyParsed.data;
  try {
    // Validate both nodes exist AND belong to this tenant
    const sourceRows = await db
      .select({ id: reachNodesTable.id })
      .from(reachNodesTable)
      .where(and(eq(reachNodesTable.id, sourceNodeId), eq(reachNodesTable.tenantId, tenant.id)))
      .limit(1);
    if (!sourceRows[0]) {
      res.status(422).json({ error: "Source node not found in this tenant" });
      return;
    }
    const targetRows = await db
      .select({ id: reachNodesTable.id })
      .from(reachNodesTable)
      .where(and(eq(reachNodesTable.id, targetNodeId), eq(reachNodesTable.tenantId, tenant.id)))
      .limit(1);
    if (!targetRows[0]) {
      res.status(422).json({ error: "Target node not found in this tenant" });
      return;
    }

    const inserted = await db
      .insert(reachEdgesTable)
      .values({
        tenantId: tenant.id,
        sourceNodeId,
        targetNodeId,
        createdByUserId: sess.uid,
      })
      .returning();

    res.status(201).json(serializeEdge(inserted[0]!));
  } catch (err: unknown) {
    // Handle duplicate edge gracefully
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505") {
      // Return 409 to indicate the edge already exists
      res.status(409).json({ error: "Edge already exists" });
      return;
    }
    req.log.error({ err }, "createReachEdge error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /t/:slug/reach/nodes/:id
router.delete("/t/:slug/reach/nodes/:id", requireOwner, async (req: Request, res: Response) => {
  const parsed = DeleteReachNodeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const deleted = await db
      .delete(reachNodesTable)
      .where(and(eq(reachNodesTable.id, parsed.data.id), eq(reachNodesTable.tenantId, tenant.id)))
      .returning();
    if (!deleted[0]) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "deleteReachNode error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /t/:slug/reach/edges/:id
router.delete("/t/:slug/reach/edges/:id", requireOwner, async (req: Request, res: Response) => {
  const parsed = DeleteReachEdgeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const deleted = await db
      .delete(reachEdgesTable)
      .where(and(eq(reachEdgesTable.id, parsed.data.id), eq(reachEdgesTable.tenantId, tenant.id)))
      .returning();
    if (!deleted[0]) {
      res.status(404).json({ error: "Edge not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "deleteReachEdge error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;
