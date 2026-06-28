import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const reachNodesTable = pgTable(
  "reach_nodes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    label: text("label").notNull(),
    category: text("category").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    note: text("note"),
    isAnchor: boolean("is_anchor").notNull().default(false),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reach_nodes_tenant_id_idx").on(table.tenantId)],
);

export type ReachNodeRow = typeof reachNodesTable.$inferSelect;
export type InsertReachNode = typeof reachNodesTable.$inferInsert;
