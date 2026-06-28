# Milestone: Frontend Rebuild (multi-tenant) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Convert the single-tenant React SPA into the multi-tenant platform UI: `/<slug>` routing, every page on the slug-scoped generated hooks, a platform landing + public directory, the claim-a-page form, a dashboard, tenant-aware layout/nav, and the new Blobs upload flow. Clears all ~38 frontend typecheck errors.

**Architecture:** `wouter` routes with the tenant slug as the first segment; platform routes (`/`, `/sign-in`, `/create`, `/dashboard`) match before `/:slug...`. Pages read `slug` from the route (`useParams`). Per-tenant ownership is derived client-side from `useListMyTenants()` (+ `isAdmin`). Tenant pages are data-driven from `tenant.pageConfig`. Media uploads `POST` the file to `/api/uploads` (the native Blobs function) and store the returned `objectPath`.

**Tech Stack:** React 19, wouter, TanStack Query via generated hooks, shadcn/ui (55 primitives in `components/ui/`), Tailwind v4, framer-motion.

**Verification reality:** built **blind** (this Mac can't run Vite); the gate is `pnpm --filter @workspace/memorial run typecheck`. Frontend tasks are interdependent, so the error count must **strictly decrease** with no new unrelated errors per task; **GREEN (0 errors) is required only after T4.** Visual/runtime behavior is verified at the first deploy.

## Global Constraints

- **pnpm only; no tests; no secrets; no deploy.** `tsc` is the gate.
- Path alias `@/*` → `artifacts/memorial/src/*`. Reuse existing shadcn/ui components and the serif/warm aesthetic already in the codebase; don't restyle wholesale.
- React/react-dom are pinned exactly — do not bump.
- Generated hooks are slug-first: e.g. `useListMessages(slug, params?, options?)`, `useGetMessage(slug, id, options?)`, `useGetReach(slug, options?)`, `useCreateMessage(options?)` (mutation; `slug` passed in `.mutate({ slug, data })` — CONFIRM the exact mutation arg shape by reading the generated hook), `useGetTenant(slug)`, `useCheckSlugAvailability(slug)`, `useCreateTenant`, `useListMyTenants`, `useListTenants`. Implementers MUST read the generated signatures before calling.
- Ownership in UI: `const { data: mine } = useListMyTenants()` (enabled when authenticated); `isOwner = isAdmin || (mine ?? []).some(t => t.slug === slug)`.

---

## File Structure
- Modify: `App.tsx` (routing), `components/layout.tsx` (tenant-aware nav).
- Create: `lib/upload.ts` (Blobs upload helper), `lib/tenant.ts` (slug helpers/hooks), `pages/landing.tsx`, `pages/create.tsx`, `pages/dashboard.tsx`, `pages/manage.tsx`.
- Modify: `pages/home.tsx`, `pages/wall.tsx`, `pages/compose.tsx`, `pages/tribute.tsx`, `pages/sign-in.tsx`, `components/video-recorder.tsx`, `components/inline-video-recorder.tsx`, `components/card-designer.tsx`, `components/reach-network.tsx`, `components/world-map.tsx`.
- Remove: `pages/admin.tsx` (replaced by `pages/manage.tsx`).

---

### Task 1: Routing, layout, sign-in redirect, upload helper, page stubs

**Files:** `App.tsx`, `components/layout.tsx`, `lib/upload.ts`, `lib/tenant.ts`, `pages/sign-in.tsx`, and minimal stubs for `pages/landing.tsx`, `pages/create.tsx`, `pages/dashboard.tsx`, `pages/manage.tsx`.

- [ ] **Step 1: Routing.** Rewrite `App.tsx`'s `Router` Switch (platform routes first, tenant slug last):
```tsx
<Switch>
  <Route path="/" component={Landing} />
  <Route path="/sign-in" component={SignIn} />
  <Route path="/create" component={Create} />
  <Route path="/dashboard" component={Dashboard} />
  <Route path="/:slug/wall" component={Wall} />
  <Route path="/:slug/compose" component={Compose} />
  <Route path="/:slug/map" component={MapPage} />
  <Route path="/:slug/manage" component={Manage} />
  <Route path="/:slug/tribute/:id" component={Tribute} />
  <Route path="/:slug" component={Home} />
  <Route component={NotFound} />
</Switch>
```
(`MapPage` can be a thin wrapper rendering the reach component full-page, or reuse Home's reach section — pick the simplest; a dedicated `pages/map.tsx` is fine.) Pages read the slug via wouter `useParams<{ slug: string }>()`. If `useParams` typing is awkward, use the `<Route path="/:slug/wall">{(params) => <Wall slug={params.slug} />}</Route>` render-prop form — choose whichever typechecks and use it consistently.

- [ ] **Step 2: `lib/tenant.ts`.** A tiny helper to read the current slug and platform-route detection:
```ts
import { useParams } from "wouter";
export const PLATFORM_SEGMENTS = new Set(["", "sign-in", "create", "dashboard"]);
export function useTenantSlug(): string | undefined {
  const p = useParams();
  return (p as Record<string, string>).slug;
}
```

- [ ] **Step 3: `lib/upload.ts`.** Replace the GCS signed-URL flow:
```ts
// POST a file to the native Blobs upload function; returns the stored object path.
export async function uploadFile(file: Blob, contentType: string): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": contentType },
    body: file,
    credentials: "include",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Upload failed (${res.status})`);
  }
  const json = (await res.json()) as { objectPath: string };
  return json.objectPath;
}
```

- [ ] **Step 4: Rewire the three upload components** (`video-recorder.tsx`, `inline-video-recorder.tsx`, `card-designer.tsx`): remove the `useRequestUploadUrl` import/usage; call `uploadFile(blob, contentType)` and use the returned `objectPath` where the old `objectPath` was used (stored as `videoPath`/`photoPath`/card `photoPath`). Enforce the ~18 MB client cap on video before upload (check `blob.size`) with a clear message. Keep recording UI as-is.

- [ ] **Step 5: Layout tenant-aware.** Rewrite `components/layout.tsx` so nav adapts: derive the first path segment from `useLocation()`. If it's a platform segment, show platform nav (brand "belovedfriend.org", links: Create a page, Dashboard/Sign in). Otherwise treat it as a tenant slug: brand = the friend's name (`useGetTenant(slug)` → `friendName`, with `enabled`), links to `/<slug>/wall`, `/<slug>/map`, `/<slug>/compose`, and `/<slug>/manage` (only when `isOwner`). Sign-in link carries the tenant context: `/sign-in?slug=<slug>&intent=compose`.

- [ ] **Step 6: Sign-in redirect.** Update `pages/sign-in.tsx`: the request-link form passes `slug` + `intent` (read from the URL query string) into `useRequestMagicLink` so the backend computes `redirect_to`; on `verify` success, navigate to the returned `redirectTo` (default `/dashboard`). Read the existing sign-in page and adapt its request/verify calls to include these.

- [ ] **Step 7: Stubs.** Create minimal `pages/landing.tsx`, `pages/create.tsx`, `pages/dashboard.tsx`, `pages/manage.tsx` that render a heading + "coming together" placeholder (real content in T3/T4) so `App.tsx` compiles. Delete `pages/admin.tsx`.

- [ ] **Step 8: Verify + commit.** `pnpm --filter @workspace/memorial run typecheck` — error count must DROP substantially vs the 38 baseline (routing/auth/upload files clean; remaining errors only in not-yet-converted pages/components). Commit: `feat(web): multi-tenant routing, tenant-aware layout, sign-in redirect, Blobs upload`.

---

### Task 2: Core tenant pages (home, wall, compose, tribute)

- [ ] **Step 1: `pages/home.tsx`** — data-driven tenant home. `const slug = useTenantSlug()`; `useGetTenant(slug)`; render hero from `tenant.friendName`, dates (`birthYear`–`deathYear` when `pageConfig.hero.showDates`), `tagline`; render sections per `pageConfig.sections.order`/toggles (story blocks, a link to the wall, the reach section via `<ReachNetwork slug={slug} />`); CTA labels from `pageConfig.cta`. 404 UI if tenant missing. Replace all hard-coded "Luis Ventura" content.
- [ ] **Step 2: `pages/wall.tsx`** — `useListMessages(slug, { type })`; add a 4th filter **"Links"**; render link-type messages as cards opening `url` in a new tab (`target="_blank" rel="noopener noreferrer"`); other types as today. Stats via `useGetMessageStats(slug)`. Links to `/<slug>/tribute/:id` and `/<slug>/compose`.
- [ ] **Step 3: `pages/compose.tsx`** — `useCreateMessage` with `slug` (read the mutation's arg shape); use `uploadFile` for video/photo; on success navigate to `/<slug>/wall`. Requires auth — if not authenticated, link to `/sign-in?slug=<slug>&intent=compose`.
- [ ] **Step 4: `pages/tribute.tsx`** — `useGetMessage(slug, id)`; media via `/api${videoPath}` / `/api${photoPath}` (now served by the media function). Back link to `/<slug>/wall`.
- [ ] **Step 5: Verify + commit.** memorial typecheck error count drops further. Commit: `feat(web): tenant-scoped home, wall (+Links), compose, tribute`.

---

### Task 3: Platform pages (landing, create, dashboard)

- [ ] **Step 1: `pages/landing.tsx`** — platform marketing hero + "Create a tribute page" CTA (→ `/create`) + a directory grid from `useListTenants()` (cards → `/<slug>`). No auth required.
- [ ] **Step 2: `pages/create.tsx`** — claim form (requires auth; if not authed, prompt to sign in via `/sign-in?intent=create`). Fields: slug (with live `useCheckSlugAvailability(slug)` debounced + inline available/taken indicator), friendName, birthYear, deathYear, tagline. Submit `useCreateTenant`; on success navigate to `/<slug>/manage`. Show the 409/422 errors from the mutation.
- [ ] **Step 3: `pages/dashboard.tsx`** — `useListMyTenants()`; list the caller's pages with links to `/<slug>` and `/<slug>/manage`; empty state → CTA to `/create`. Requires auth.
- [ ] **Step 4: Verify + commit.** Commit: `feat(web): platform landing + directory, claim form, dashboard`.

---

### Task 4: Manage page + reach/world-map compile-fix

- [ ] **Step 1: `pages/manage.tsx`** — owner/admin only (`isOwner` gate; else "not authorized"). Basic for now (rich editor=M7, full moderation=M8): list the tenant's tributes (`useListMessages(slug, {type:'all'})`) with delete (`useDeleteMessage`); an "Add a link" form (create a `type:'link'` message); edit tenant meta + simple page_config fields via `useUpdateTenant`. Keep it functional, not fancy.
- [ ] **Step 2: `components/reach-network.tsx` + `components/world-map.tsx`** — make them compile against the new contract and accept a `slug` prop: use `useGetReach(slug)` (returns `{nodes, edges, summary}`); `ReachNode` is now `{ id:number, label, category:string, lat?, lng?, note?, isAnchor, createdAt }` (no `weight`). Replace the fixed `CATEGORY_COLOR`/`CATEGORY_LABEL` keyed on a literal union with a lookup that tolerates an arbitrary `category: string` (default color/label for unknown). Plot map points by lat/lng; render the constellation from nodes/edges. Add a **fullscreen** button (Fullscreen API on the container) and an "Add to the map" affordance that POSTs a node via `useCreateReachNode` (sign-in required). Derive the summary strip from `summary` counts. (This is the compile-fix + baseline; the full visual revamp is M6 — keep it working and reasonably faithful to the existing constellation/map look.)
- [ ] **Step 3: Verify + commit.** `pnpm --filter @workspace/memorial run typecheck` → **GREEN (0 errors)**. `pnpm run typecheck` (full workspace) → GREEN. Commit: `feat(web): tenant manage page + generalized reach/world-map`.

---

## Self-Review

**Spec coverage:** `/<slug>` routing (§5) ✓; tenant-aware layout ✓; sign-in redirect_to consumption (§6) ✓; data-driven home from page_config (§8) ✓; wall + Links (§9) ✓; compose + Blobs upload (§13) ✓; landing + directory (§12) ✓; claim form + availability (§7) ✓; dashboard (§12) ✓; manage (basic moderation/edit) (§11) ✓; reach/world-map generalized + fullscreen + add-node (§10) ✓.

**Placeholder scan:** T1 intentionally creates page STUBS that T3/T4 flesh out (a sequencing device for an interdependent rebuild, not abandoned placeholders) — each is completed by a later task. Implementers must read generated hook signatures + existing pages before coding (integration work).

**Interdependency note:** GREEN is required only after T4; interim tasks must strictly reduce the error count. The full reach **visual** revamp and rich editor/moderation are M6/M7/M8 — T4 delivers a compiling, functional baseline.
