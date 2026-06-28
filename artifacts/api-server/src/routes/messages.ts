import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreateMessageBody,
  ListMessagesParams,
  ListMessagesQueryParams,
  GetMessageParams,
  UpdateMessageParams,
  UpdateMessageBody,
  DeleteMessageParams,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { messagesTable, usersTable } from "@workspace/db/schema";
import { getSession, requireAuth } from "../lib/session";
import { resolveTenant, isBlocked, requireOwner, getTenantFromReq } from "../lib/tenancy";
import { mediaStore, keyFromObjectPath } from "../lib/blobs";

async function tryDeleteObject(objectPath: string | null | undefined, log: { warn: (o: object, m: string) => void }) {
  if (!objectPath) return;
  const key = keyFromObjectPath(objectPath);
  if (!key) return;
  try { await mediaStore().delete(key); }
  catch (err) { log.warn({ err, objectPath }, "failed to delete blob"); }
}

const router: IRouter = Router();

function serialize(row: typeof messagesTable.$inferSelect) {
  return {
    id: row.id,
    type: row.type as "card" | "video" | "link",
    body: row.body,
    authorName: row.authorName,
    relationship: row.relationship,
    location: row.location,
    videoPath: row.videoPath,
    photoPath: row.photoPath,
    card: row.card,
    url: row.url,
    nodeId: row.nodeId,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /t/:slug/messages
router.get("/t/:slug/messages", async (req: Request, res: Response) => {
  const slugParsed = ListMessagesParams.safeParse(req.params);
  if (!slugParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(slugParsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const parsed = ListMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { type, limit } = parsed.data;
  try {
    const baseWhere =
      type && type !== "all"
        ? and(eq(messagesTable.tenantId, tenant.id), eq(messagesTable.type, type))
        : eq(messagesTable.tenantId, tenant.id);
    const rows = await db
      .select()
      .from(messagesTable)
      .where(baseWhere)
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit ?? 200);
    res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "listMessages error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /t/:slug/messages/stats
router.get("/t/:slug/messages/stats", async (req: Request, res: Response) => {
  const slugParsed = ListMessagesParams.safeParse(req.params);
  if (!slugParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(slugParsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const tenantFilter = eq(messagesTable.tenantId, tenant.id);
    const rows = await db
      .select({
        total: sql<number>`count(*)::int`,
        cards: sql<number>`sum(case when ${messagesTable.type} = 'card' then 1 else 0 end)::int`,
        videos: sql<number>`sum(case when ${messagesTable.type} = 'video' then 1 else 0 end)::int`,
        contributors: sql<number>`count(distinct ${messagesTable.authorName})::int`,
      })
      .from(messagesTable)
      .where(tenantFilter);
    const locations = await db
      .selectDistinct({ location: messagesTable.location })
      .from(messagesTable)
      .where(tenantFilter);
    const countries = new Set(
      locations
        .map((l: { location: string | null }) =>
          (l.location ?? "").split(",").pop()?.trim().toLowerCase(),
        )
        .filter((v: string | undefined): v is string => !!v),
    );
    const recent = await db
      .select({ name: messagesTable.authorName })
      .from(messagesTable)
      .where(tenantFilter)
      .orderBy(desc(messagesTable.createdAt))
      .limit(8);
    const stats = rows[0] ?? { total: 0, cards: 0, videos: 0, contributors: 0 };
    res.json({
      total: stats.total ?? 0,
      cards: stats.cards ?? 0,
      videos: stats.videos ?? 0,
      contributors: stats.contributors ?? 0,
      countries: countries.size,
      recentAuthors: recent.map((r: { name: string }) => r.name),
    });
  } catch (err) {
    req.log.error({ err }, "stats error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /t/:slug/messages/:id
router.get("/t/:slug/messages/:id", async (req: Request, res: Response) => {
  const parsed = GetMessageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const tenant = await resolveTenant(parsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.id, parsed.data.id), eq(messagesTable.tenantId, tenant.id)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(serialize(row));
  } catch (err) {
    req.log.error({ err }, "getMessage error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /t/:slug/messages
router.post("/t/:slug/messages", requireAuth, async (req: Request, res: Response) => {
  const slugParsed = ListMessagesParams.safeParse(req.params);
  if (!slugParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const tenant = await resolveTenant(slugParsed.data.slug);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const sess = getSession(req)!;
  if (await isBlocked(tenant.id, sess.uid)) {
    res.status(403).json({ error: "You are blocked from contributing to this page" });
    return;
  }
  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  const data = parsed.data;

  // Link type requires owner or super-admin
  if (data.type === "link") {
    const isOwner = tenant.ownerUserId === sess.uid;
    if (!isOwner) {
      // Check super-admin
      const userRows = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, sess.uid))
        .limit(1);
      const isSuperAdmin = userRows[0]?.role === "admin";
      if (!isSuperAdmin) {
        res.status(403).json({ error: "Only the page owner can add link tributes" });
        return;
      }
    }
  }

  if (data.type === "video" && !data.videoPath) {
    res.status(400).json({ error: "A recorded video is required for video tributes." });
    return;
  }
  try {
    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, sess.uid))
      .limit(1);
    const user = userRows[0];
    const authorName =
      (data.authorName?.trim() || user?.name?.trim() || user?.email.split("@")[0] || "Friend");

    const inserted = await db
      .insert(messagesTable)
      .values({
        tenantId: tenant.id,
        userId: sess.uid,
        type: data.type,
        body: data.body ?? null,
        authorName,
        relationship: data.relationship ?? null,
        location: data.location ?? null,
        videoPath: data.videoPath ?? null,
        photoPath: data.photoPath ?? null,
        card: data.card ?? null,
        url: data.url ?? null,
        nodeId: data.nodeId ?? null,
      })
      .returning();

    if (data.authorName && data.authorName.trim() && !user?.name) {
      await db
        .update(usersTable)
        .set({ name: data.authorName.trim() })
        .where(eq(usersTable.id, sess.uid));
    }

    res.status(201).json(serialize(inserted[0]!));
  } catch (err) {
    req.log.error({ err }, "createMessage error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// PATCH /t/:slug/messages/:id
router.patch("/t/:slug/messages/:id", requireOwner, async (req: Request, res: Response) => {
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
  const tenant = getTenantFromReq(req);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const patch: Partial<typeof messagesTable.$inferInsert> = {};
  const d = bodyParsed.data;
  if (d.body !== undefined) patch.body = d.body;
  if (d.authorName !== undefined) patch.authorName = d.authorName;
  if (d.relationship !== undefined) patch.relationship = d.relationship;
  if (d.location !== undefined) patch.location = d.location;
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

// DELETE /t/:slug/messages/:id
router.delete("/t/:slug/messages/:id", requireOwner, async (req: Request, res: Response) => {
  const parsed = DeleteMessageParams.safeParse(req.params);
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

export default router;
