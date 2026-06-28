import { pgTable, serial, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  type: text("type").notNull(),
  body: text("body"),
  authorName: text("author_name").notNull(),
  relationship: text("relationship"),
  location: text("location"),
  videoPath: text("video_path"),
  photoPath: text("photo_path"),
  card: jsonb("card"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MessageRow = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
