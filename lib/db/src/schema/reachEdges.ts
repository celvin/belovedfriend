import {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { reachNodesTable } from "./reachNodes";
import { usersTable } from "./users";

export const reachEdgesTable = pgTable(
  "reach_edges",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    sourceNodeId: integer("source_node_id")
      .notNull()
      .references(() => reachNodesTable.id, { onDelete: "cascade" }),
    targetNodeId: integer("target_node_id")
      .notNull()
      .references(() => reachNodesTable.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reach_edges_tenant_id_idx").on(table.tenantId),
    unique("reach_edges_unique").on(
      table.tenantId,
      table.sourceNodeId,
      table.targetNodeId,
    ),
  ],
);

export type ReachEdgeRow = typeof reachEdgesTable.$inferSelect;
export type InsertReachEdge = typeof reachEdgesTable.$inferInsert;
