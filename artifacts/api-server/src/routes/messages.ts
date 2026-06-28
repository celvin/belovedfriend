import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  CreateMessageBody,
  ListMessagesQueryParams,
  GetMessageParams,
  UpdateMessageBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { messagesTable, usersTable } from "@workspace/db/schema";
import { getSession, requireAdmin, requireAuth } from "../lib/session";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

async function tryDeleteObject(path: string | null | undefined, log: { warn: (o: object, m: string) => void }) {
  if (!path) return;
  try {
    const file = await objectStorageService.getObjectEntityFile(path);
    await file.delete({ ignoreNotFound: true });
  } catch (err) {
    log.warn({ err, path }, "failed to delete storage object");
  }
}

const router: IRouter = Router();

function serialize(row: typeof messagesTable.$inferSelect) {
  return {
    id: row.id,
    type: row.type as "card" | "video",
    body: row.body,
    authorName: row.authorName,
    relationship: row.relationship,
    location: row.location,
    videoPath: row.videoPath,
    photoPath: row.photoPath,
    card: row.card,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/messages", async (req: Request, res: Response) => {
  const parsed = ListMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { type, limit } = parsed.data;
  try {
    const baseQuery = db.select().from(messagesTable);
    const filtered =
      type && type !== "all"
        ? baseQuery.where(eq(messagesTable.type, type))
        : baseQuery;
    const rows = await filtered.orderBy(desc(messagesTable.createdAt)).limit(limit ?? 200);
    res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "listMessages error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.get("/messages/stats", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        total: sql<number>`count(*)::int`,
        cards: sql<number>`sum(case when ${messagesTable.type} = 'card' then 1 else 0 end)::int`,
        videos: sql<number>`sum(case when ${messagesTable.type} = 'video' then 1 else 0 end)::int`,
        contributors: sql<number>`count(distinct ${messagesTable.authorName})::int`,
      })
      .from(messagesTable);
    const locations = await db
      .selectDistinct({ location: messagesTable.location })
      .from(messagesTable);
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

router.get("/messages/:id", async (req: Request, res: Response) => {
  const parsed = GetMessageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, parsed.data.id))
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

router.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  const data = parsed.data;
  if (data.type === "video" && !data.videoPath) {
    res.status(400).json({ error: "A recorded video is required for video tributes." });
    return;
  }
  try {
    const sess = getSession(req)!;
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
        userId: sess.uid,
        type: data.type,
        body: data.body ?? null,
        authorName,
        relationship: data.relationship ?? null,
        location: data.location ?? null,
        videoPath: data.videoPath ?? null,
        photoPath: data.photoPath ?? null,
        card: data.card ?? null,
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

router.patch("/messages/:id", requireAdmin, async (req: Request, res: Response) => {
  const paramsParsed = GetMessageParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid update" });
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
      .where(eq(messagesTable.id, paramsParsed.data.id))
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

router.delete("/messages/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = GetMessageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const deleted = await db
      .delete(messagesTable)
      .where(eq(messagesTable.id, parsed.data.id))
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
