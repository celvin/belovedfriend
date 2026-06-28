# Milestone 4: Tenant-Scoped Auth (redirect_to) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Magic-link sign-in returns the user to the right place — a friend page (`/<slug>` or `/<slug>/compose`) or a platform action (`/create`, `/dashboard`) — by storing a computed `redirect_to` on the magic-link row and returning it from `verify`.

**Architecture:** `request-link` accepts optional `slug` + `intent`; the server computes a safe `redirect_to`, stores it on the `magic_links` row (the `redirect_to` column from M1), and `verify` returns `redirectTo` for the SPA to navigate to. The atomic consume is preserved; only the stored/returned redirect is added.

**Tech Stack:** Express, Drizzle, orval/Zod codegen.

Milestone 4 of [the spec](../specs/2026-06-28-multi-tenant-tribute-platform-design.md) (§6). Frontend sign-in navigation to `redirectTo` is handled in the frontend-rebuild milestone.

## Global Constraints

- **pnpm only**; **no tests**; **no secrets**. Verification: `pnpm --filter @workspace/api-spec run codegen` + `pnpm run typecheck:libs` + `pnpm --filter @workspace/api-server run typecheck` (only the known `messages.ts` error may remain).
- **Codegen workflow:** edit `openapi.yaml` → codegen → update route. Never hand-edit `src/generated/`.
- **Preserve the atomic conditional-UPDATE consume** in `/auth/verify`.
- `redirect_to` must be an **internal path only** — never an absolute URL (open-redirect guard).

---

### Task 1: redirect_to end-to-end (openapi + codegen + auth route)

**Files:** Modify `lib/api-spec/openapi.yaml` (+ regenerate), `artifacts/api-server/src/routes/auth.ts`.

**Interfaces (produced):** `RequestMagicLinkBody` gains optional `slug?: string`, `intent?: string`; the verify response (`VerifyMagicLinkResponse` or whatever the spec calls the `/auth/verify` 200 body) gains `redirectTo: string`.

- [ ] **Step 1: openapi.** In `openapi.yaml`, add to the request-link request body schema two optional properties: `slug` (string) and `intent` (string, enum `[compose, map, create]` is fine, or plain string). Add `redirectTo` (string) to the `/auth/verify` 200 response schema (the schema currently returning `{ user }`). Keep existing fields.

- [ ] **Step 2: codegen.** Run `pnpm --filter @workspace/api-spec run codegen`. Must end with `typecheck:libs` passing.

- [ ] **Step 3: auth.ts — compute & store redirect_to.** Add a helper near the top of `routes/auth.ts`:

```ts
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
```

In the `POST /auth/request-link` handler, after `const parsed = RequestMagicLinkBody.safeParse(...)` succeeds, compute `const redirectTo = computeRedirectTo(parsed.data.slug, parsed.data.intent);` and add `redirectTo` to the `db.insert(magicLinksTable).values({...})` call (alongside the existing `email, tokenHash, expiresAt, requestIp`). Map it to the `redirectTo` column.

- [ ] **Step 4: auth.ts — return redirectTo from verify.** In `POST /auth/verify`, after the atomic consume returns `link`, include the stored redirect in the response. Change the success `res.json({ user: {...} })` to `res.json({ user: {...}, redirectTo: link.redirectTo ?? "/dashboard" })`. Do NOT alter the conditional UPDATE itself.

- [ ] **Step 5: Verify.**
  - `pnpm --filter @workspace/api-spec run codegen` (already run) — green.
  - `pnpm run typecheck:libs` → PASS.
  - `pnpm --filter @workspace/api-server run typecheck 2>&1 | tail -20` → auth.ts clean; only the pre-existing `messages.ts` error remains.

- [ ] **Step 6: Commit** (openapi + regenerated + auth.ts together):
  ```bash
  git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated artifacts/api-server/src/routes/auth.ts
  git commit -m "feat(auth): tenant-scoped magic-link redirect_to

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-Review

**Spec coverage (§6):** request-link accepts slug+intent ✓; redirect_to stored on the row ✓; verify returns redirectTo ✓; atomic consume preserved ✓; open-redirect guard (internal paths only, slug regex-validated) ✓.

**Placeholder scan:** none — `computeRedirectTo` is complete; openapi changes specified as a contract.

**Type consistency:** `redirectTo` column exists (M1); `parsed.data.slug/intent` come from the regenerated `RequestMagicLinkBody`; verify response `redirectTo` matches the regenerated response type.
