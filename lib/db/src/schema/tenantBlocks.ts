import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const tenantBlocksTable = pgTable(
  "tenant_blocks",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    blockedByUserId: integer("blocked_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tenant_blocks_unique").on(table.tenantId, table.userId)],
);

export type TenantBlockRow = typeof tenantBlocksTable.$inferSelect;
export type InsertTenantBlock = typeof tenantBlocksTable.$inferInsert;
