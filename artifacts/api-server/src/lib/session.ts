import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}
const SECRET: string = SESSION_SECRET;

const COOKIE_NAME = "lv_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  uid: number;
  email: string;
  role?: "user" | "admin";
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as SessionPayload;
    return { uid: decoded.uid, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "crivas@cikume.com").toLowerCase();

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readSession(req: Request): SessionPayload | null {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

type WithSession = { session?: SessionPayload | null };

export function getSession(req: Request): SessionPayload | null {
  return (req as Request & WithSession).session ?? null;
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  (req as Request & WithSession).session = readSession(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const s = (req as Request & WithSession).session;
  if (!s) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const s = (req as Request & WithSession).session;
  if (!s) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const rows = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, s.uid))
      .limit(1);
    const role = rows[0]?.role;
    if (role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Authorization check failed" });
  }
}
