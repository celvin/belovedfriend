import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { reachNodesTable } from "./reachNodes";

export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    userId: integer("user_id"),
    type: text("type").notNull(), // 'card' | 'video' | 'link'
    body: text("body"),
    url: text("url"), // target for type: 'link'
    authorName: text("author_name").notNull(),
    relationship: text("relationship"),
    location: text("location"),
    videoPath: text("video_path"),
    photoPath: text("photo_path"),
    nodeId: integer("node_id").references(() => reachNodesTable.id, {
      onDelete: "set null",
    }),
    card: jsonb("card"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_tenant_id_idx").on(table.tenantId)],
);

export type MessageRow = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
