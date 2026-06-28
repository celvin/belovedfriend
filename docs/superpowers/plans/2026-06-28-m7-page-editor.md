# Milestone 7: Full Page Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans.

**Goal:** Let owners adjust their page as they wish — a structured `page_config` editor on `/:slug/manage` covering theme, hero, story blocks, section toggles/order, reach-summary callouts, and CTA labels (the editable-structured-sections design, spec §8).

**Architecture:** Extend `pages/manage.tsx` with a "Page settings" section that loads the tenant's current `page_config`, edits it in local state, and saves the whole object via `useUpdateTenant` (`PATCH /api/tenants/:slug` validates it against `PageConfigSchema`). Hero photo reuses the Blobs `uploadFile` helper.

Builds on M3 (PageConfigSchema/PATCH) + the existing manage page. Verified by typecheck + preview deploy.

## Global Constraints
- pnpm only; no tests; no secrets. Gate: `pnpm run typecheck` GREEN; visual check on preview.
- The saved object MUST satisfy `PageConfigSchema` (artifacts/api-server/src/lib/tenancy.ts): `version:1`, `theme{palette,accent,font}`, `hero{heroPhotoPath,showDates}`, `story{enabled,blocks[]}`, `sections{order[],story,wall,reach}`, `reachSummary[]`, `cta{primaryLabel,wallLabel}`. Reuse the existing default shape when fields are missing.
- Reuse existing shadcn/ui (Input, Button, Textarea, Switch/checkbox). Owner/admin-gated (the page already gates `isOwner`).

---

### Task 1: page_config editor on /manage
**Files:** modify `artifacts/memorial/src/pages/manage.tsx`; use `@/lib/upload`.
- [ ] **Step 1.** Read `manage.tsx` (it has tenant meta edit + add-link + delete + block) and `lib/tenancy.ts` for the exact `PageConfig` shape. Add a collapsible **"Page settings"** section that seeds local state from `tenant.pageConfig` (merge over the default shape so missing keys don't break), with controls:
  - **Theme:** `font` select (serif/sans/handwritten); `accent` color input (`<input type="color">`); `palette` text/select.
  - **Hero:** `showDates` toggle; `heroPhotoPath` — a file input that calls `uploadFile(file, file.type)` and stores the returned objectPath (show the current photo if set; allow clearing).
  - **Story:** `enabled` toggle; a list of `blocks` ({heading, body}) with add / edit / remove (heading Input + body Textarea per block).
  - **Sections:** three toggles (story/wall/reach) and simple ordering (up/down buttons over `order`, constrained to those three keys).
  - **Reach summary:** editable list of callouts ({label, and either a `value` text OR a `derived` select of nodeCount/placeCount/contributorCount/countryCount}) with add/remove.
  - **CTA:** `primaryLabel`, `wallLabel` inputs.
- [ ] **Step 2.** A **Save** button builds the full `page_config` object (version:1 + all sections) and calls `useUpdateTenant.mutate({ slug, data: { pageConfig } })`; on success invalidate `getGetTenantQueryKey(slug)` and show a saved indicator; on 422 show "Invalid page settings". Keep the existing meta/links/blocks/blocks sections working.
- [ ] **Step 3.** `pnpm run typecheck` GREEN. Commit: `feat(web): structured page_config editor on the manage page`.

---

## Self-Review
**Spec coverage (§8):** owner edits theme/hero/story/sections/reachSummary/CTA; saved as validated page_config; hero photo via Blobs. ✓
**Placeholder scan:** none — concrete controls mapped to the schema; PATCH + PageConfigSchema already exist.
