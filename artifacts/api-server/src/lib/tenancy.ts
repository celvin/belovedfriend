import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantsTable, tenantBlocksTable, usersTable, type TenantRow } from "@workspace/db/schema";
import { getSession } from "./session";

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export const RESERVED_SLUGS = new Set<string>([
  "api", "sign-in", "signin", "create", "dashboard", "admin", "login",
  "logout", "www", "about", "pricing", "terms", "privacy", "help",
  "support", "contact", "static", "assets", "public", "t",
]);

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// Versioned page configuration (spec §8). Stored in tenants.page_config (jsonb).
export const PageConfigSchema = z.object({
  version: z.literal(1),
  theme: z.object({
    palette: z.string().default("warm"),
    accent: z.string().default("#7a4a1f"),
    font: z.enum(["serif", "sans", "handwritten"]).default("serif"),
  }),
  hero: z.object({
    heroPhotoPath: z.string().nullable().default(null),
    showDates: z.boolean().default(true),
  }),
  story: z.object({
    enabled: z.boolean().default(true),
    blocks: z.array(z.object({ heading: z.string(), body: z.string() })).default([]),
  }),
  sections: z.object({
    order: z.array(z.enum(["story", "wall", "reach"])).default(["story", "wall", "reach"]),
    story: z.boolean().default(true),
    wall: z.boolean().default(true),
    reach: z.boolean().default(true),
  }),
  reachSummary: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]).optional(),
        derived: z.enum(["nodeCount", "placeCount", "contributorCount", "countryCount"]).optional(),
      }),
    )
    .default([]),
  cta: z.object({
    primaryLabel: z.string().default("Leave a tribute"),
    wallLabel: z.string().default("Read tributes"),
  }),
});

export type PageConfig = z.infer<typeof PageConfigSchema>;

export function defaultPageConfig(friendName: string): PageConfig {
  return PageConfigSchema.parse({
    version: 1,
    theme: { palette: "warm", accent: "#7a4a1f", font: "serif" },
    hero: { heroPhotoPath: null, showDates: true },
    story: {
      enabled: true,
      blocks: [{ heading: `Remembering ${friendName}`, body: "" }],
    },
    sections: { order: ["story", "wall", "reach"], story: true, wall: true, reach: true },
    reachSummary: [{ label: "Memories", derived: "nodeCount" }],
    cta: { primaryLabel: "Leave a tribute", wallLabel: "Read tributes" },
  });
}

export async function resolveTenant(slug: string): Promise<TenantRow | null> {
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

async function isSuperAdmin(userId: number): Promise<boolean> {
  const rows = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0]?.role === "admin";
}

export async function isBlocked(tenantId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: tenantBlocksTable.id })
    .from(tenantBlocksTable)
    .where(and(eq(tenantBlocksTable.tenantId, tenantId), eq(tenantBlocksTable.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Attaches the resolved tenant to req for downstream handlers.
type WithTenant = { tenant?: TenantRow };

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const sess = getSession(req);
  if (!sess) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const slug = req.params.slug as string | undefined;
  const tenant = await resolveTenant(slug ?? "");
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const owner = tenant.ownerUserId === sess.uid;
  const admin = await isSuperAdmin(sess.uid);
  if (!owner && !admin) {
    res.status(403).json({ error: "You do not manage this page" });
    return;
  }
  (req as Request & WithTenant).tenant = tenant;
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const sess = getSession(req);
  if (!sess) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await isSuperAdmin(sess.uid))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function getTenantFromReq(req: Request): TenantRow | null {
  return (req as Request & WithTenant).tenant ?? null;
}
