import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const magicLinksTable = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MagicLink = typeof magicLinksTable.$inferSelect;
