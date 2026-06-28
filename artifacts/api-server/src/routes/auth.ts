import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import {
  RequestMagicLinkBody,
  VerifyMagicLinkBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable, magicLinksTable } from "@workspace/db/schema";
import {
  ADMIN_EMAIL,
  clearSessionCookie,
  getSession,
  setSessionCookie,
  signSession,
} from "../lib/session";
import {
  generateMagicLinkToken,
  hashToken,
} from "../lib/magicLinkToken";
import { sendEmail } from "../lib/email";
import { resolveTenant } from "../lib/tenancy";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const router: IRouter = Router();

const MAGIC_LINK_TTL_MS = 30 * 60 * 1000; // 30 minutes

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_PER_KEY = 5;

// Compute a safe INTERNAL redirect path from an optional tenant slug + intent.
// Never returns an absolute URL (open-redirect guard).
function computeRedirectTo(slug?: string, intent?: string): string {
  const safeSlug =
    slug && /^[a-z0-9-]{3,40}$/.test(slug) ? slug.toLowerCase() : null;
  if (safeSlug) {
    if (intent === "compose") return `/${safeSlug}/compose`;
    if (intent === "map") return `/${safeSlug}/map`;
    return `/${safeSlug}`;
  }
  if (intent === "create") return "/create";
  return "/dashboard";
}

// Serverless-safe rate limit: count recent magic-link rows for this email or IP.
async function rateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(magicLinksTable)
    .where(
      and(
        gte(magicLinksTable.createdAt, since),
        or(eq(magicLinksTable.email, email), eq(magicLinksTable.requestIp, ip)),
      ),
    );
  return (rows[0]?.n ?? 0) >= RATE_MAX_PER_KEY;
}

function resolveBaseUrl(req: Request): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = req.get("host");
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]?.trim();
  return `${proto}://${host}`;
}

router.post("/auth/request-link", async (req: Request, res: Response) => {
  const parsed = RequestMagicLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const name = parsed.data.name?.trim();
  const redirectTo = computeRedirectTo(parsed.data.slug, parsed.data.intent);

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    || req.ip
    || "unknown";
  if (await rateLimited(email, ip)) {
    res.status(429).json({
      error: "Too many requests. Please wait a few minutes and try again.",
    });
    return;
  }

  try {
    const { token, hash } = generateMagicLinkToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
    await db.insert(magicLinksTable).values({
      email,
      tokenHash: hash,
      expiresAt,
      requestIp: ip,
      redirectTo,
    });

    // Best-effort: store name hint for later
    if (name) {
      const existing = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      if (existing.length === 0) {
        // Pre-create user with just the name so we have it; user still has to verify.
        await db.insert(usersTable).values({ email, name }).onConflictDoNothing();
      } else if (!existing[0]!.name) {
        await db
          .update(usersTable)
          .set({ name })
          .where(eq(usersTable.email, email));
      }
    }

    const base = resolveBaseUrl(req);
    const link = `${base}/sign-in?token=${encodeURIComponent(token)}`;

    // Tenant-aware branding: reference the friend's page when a slug is present,
    // otherwise generic platform branding (e.g. when claiming a brand-new page).
    let friendName: string | null = null;
    if (parsed.data.slug) {
      const t = await resolveTenant(parsed.data.slug);
      if (t) friendName = t.friendName;
    }
    const safeName = friendName ? escapeHtml(friendName) : null;
    const subject = friendName
      ? `Your sign-in link — ${friendName}`
      : "Your sign-in link — belovedfriend.org";
    const introText = friendName
      ? `Thank you for taking a moment to remember ${friendName}.`
      : "Welcome to belovedfriend.org — a place to create and share online tributes for the people we love.";
    const heading = safeName ? `In memory of ${safeName}` : "belovedfriend.org";

    try {
      await sendEmail({
        to: email,
        subject,
        text:
          `${introText}\n\n` +
          `Click the link below to sign in. It expires in 30 minutes.\n\n${link}\n\n` +
          `If you did not request this email, you can safely ignore it.`,
        html: `<!doctype html><html><body style="font-family: Georgia, 'Times New Roman', serif; background:#f8f3ea; padding:32px; color:#2b2218;">
<div style="max-width:520px; margin:0 auto; background:#fffaf0; border:1px solid #e8dcc4; padding:36px 32px; border-radius:8px;">
<h2 style="font-weight:400; letter-spacing:0.02em; color:#3b2f1e; margin-top:0;">${heading}</h2>
<p>${escapeHtml(introText)}</p>
<p>Click the button below to sign in. This link will expire in 30 minutes.</p>
<p style="text-align:center; margin: 28px 0;">
  <a href="${link}" style="display:inline-block; padding:14px 28px; background:#7a4a1f; color:#fffaf0; text-decoration:none; border-radius:6px; letter-spacing:0.04em;">Open your sign-in link</a>
</p>
<p style="font-size:13px; color:#6b5a45;">If the button doesn't work, paste this link into your browser:<br/><a href="${link}" style="color:#7a4a1f;">${link}</a></p>
<hr style="border:none; border-top:1px solid #e8dcc4; margin:28px 0;"/>
<p style="font-size:12px; color:#8a7960;">If you did not request this email you can safely ignore it.</p>
</div></body></html>`,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to send magic link email");
      res
        .status(500)
        .json({ error: "We couldn't send the email right now. Please try again in a moment." });
      return;
    }

    res.json({ ok: true, message: "Sign-in link sent. Check your email." });
  } catch (err) {
    req.log.error({ err }, "request-link error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.post("/auth/verify", async (req: Request, res: Response) => {
  const parsed = VerifyMagicLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Token is required" });
    return;
  }
  const hash = hashToken(parsed.data.token);
  try {
    // Atomic single-use consumption: only one concurrent request can succeed.
    const now = new Date();
    const consumed = await db
      .update(magicLinksTable)
      .set({ consumedAt: now })
      .where(
        and(
          eq(magicLinksTable.tokenHash, hash),
          isNull(magicLinksTable.consumedAt),
          gt(magicLinksTable.expiresAt, now),
        ),
      )
      .returning();
    const link = consumed[0];
    if (!link) {
      res
        .status(400)
        .json({ error: "This link is invalid, expired, or has already been used." });
      return;
    }

    const email = link.email;
    const desiredRole: "admin" | "user" =
      email.toLowerCase() === ADMIN_EMAIL ? "admin" : "user";
    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    let user = userRows[0];
    if (!user) {
      const inserted = await db
        .insert(usersTable)
        .values({ email, role: desiredRole })
        .returning();
      user = inserted[0]!;
    } else if (desiredRole === "admin" && user.role !== "admin") {
      const updated = await db
        .update(usersTable)
        .set({ role: "admin" })
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updated[0]!;
    }

    const role = (user.role === "admin" ? "admin" : "user") as "admin" | "user";
    const token = signSession({ uid: user.id, email: user.email, role });
    setSessionCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        createdAt: user.createdAt.toISOString(),
      },
      redirectTo: link.redirectTo ?? "/dashboard",
    });
  } catch (err) {
    req.log.error({ err }, "verify error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    res.json({ authenticated: false, user: null });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, sess.uid))
      .limit(1);
    const user = rows[0];
    if (!user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    const role = (user.role === "admin" ? "admin" : "user") as "admin" | "user";
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "me error");
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.post("/auth/logout", async (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
