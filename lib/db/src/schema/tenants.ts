import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tenantsTable = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    friendName: text("friend_name").notNull(),
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    tagline: text("tagline"),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("active"),
    pageConfig: jsonb("page_config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tenants_owner_user_id_idx").on(table.ownerUserId)],
);

export type TenantRow = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
