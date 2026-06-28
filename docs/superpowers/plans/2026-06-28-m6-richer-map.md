# Milestone 6: Richer Memory Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Round out the generalized memory map: let signed-in visitors **draw connections** between existing nodes (not just add nodes), serve the world map from a **local** topojson asset (no CDN), and restore **node tributes** (clicking a node shows the tributes attached to it + lets you add one there).

**Architecture:** Frontend-only on top of the existing M5 reach API (`POST /api/t/:slug/reach/edges` already exists). The reach component gains a "Connect two" mode; `world-map.tsx` imports a bundled/static topojson; node popovers list messages whose `node_id` matches and link to compose with that node preselected.

Builds on M5 (reach API) + the T4 reach component. Verified by typecheck + preview deploy.

## Global Constraints
- pnpm only; no tests; no secrets. Gate: `pnpm run typecheck` GREEN; visual check on the preview deploy.
- Reuse existing shadcn/ui + the reach component's look. Don't regress the working constellation/world-map/add-node/fullscreen.
- `POST /api/t/:slug/reach/edges` validates that both nodes belong to the tenant (M5) — the UI just needs to pass two real node ids; surface its 422/duplicate responses gracefully.

---

### Task 1: Serve the world map from a local asset (drop the CDN)
**Files:** add `artifacts/memorial/public/countries-110m.json`; modify `artifacts/memorial/src/components/world-map.tsx`.
- [ ] **Step 1.** Download the world-atlas countries-110m topojson (the file currently fetched from `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`) into `artifacts/memorial/public/countries-110m.json`.
- [ ] **Step 2.** In `world-map.tsx`, change `WORLD_TOPOJSON_URL` to the same-origin path `"/countries-110m.json"`. Keep the existing fetch/cache/error-retry logic (it now hits our own origin — no external dependency, works offline, no CSP/CDN risk). 
- [ ] **Step 3.** `pnpm run typecheck` GREEN. Commit: `feat(web): serve world map topojson locally (drop jsdelivr CDN)`.

---

### Task 2: "Add a connection" (edge) UI
**Files:** modify `artifacts/memorial/src/components/reach-network.tsx`.
- [ ] **Step 1.** Read the current `AddNodeForm` + the "Add to map" affordance. Add a small mode switch in the add panel: **"Add a place"** (existing node form) and **"Connect two"** (new). The connect form: two `<select>`s populated from the loaded `data.nodes` (label as option text, id as value) for source + target, plus a submit. On submit call `useCreateReachEdge` with `{ slug, data: { sourceNodeId, targetNodeId } }` (read the generated hook's exact mutate shape). Validate source !== target client-side. On success, invalidate the reach query (`getGetReachQueryKey(slug)`) so the new edge appears; surface 422 / already-exists from the response. Sign-in required (reuse the existing `isAuthenticated` gate / sign-in link with `intent=map`).
- [ ] **Step 2.** `pnpm run typecheck` GREEN. Commit: `feat(web): connect two nodes (add reach edges) from the map`.

---

### Task 3: Node tributes + add-from-node
**Files:** modify `artifacts/memorial/src/components/reach-network.tsx` (node popover) and `artifacts/memorial/src/pages/compose.tsx`.
- [ ] **Step 1.** In the reach component, load the tenant's messages (`useListMessages(slug, { type: "all" })`) and, in the node popover (`NodeMarker`), show the tributes whose `nodeId === node.id` (author + a link to `/${slug}/tribute/${id}`). Add a "Share a memory from here" link → `/${slug}/compose?node=${node.id}`.
- [ ] **Step 2.** In `compose.tsx`, read an optional `node` query param (wouter `useSearch`/`URLSearchParams`); if present and numeric, include `nodeId` in the `useCreateMessage` payload so the tribute attaches to that node. Show a small "Attaching to: <node label>" hint when a node is preselected (look up the label via `useGetReach(slug)` or just show the id if simplest).
- [ ] **Step 3.** `pnpm run typecheck` GREEN. Commit: `feat(web): node tributes in the map popover + attach tribute to a node`.

---

## Self-Review
**Spec coverage (§10):** visitors add connections/edges (the explicit ask) ✓; map served locally (revamp note) ✓; node tributes restored + tribute→node attachment ✓; fullscreen + add-node + generalized categories already shipped in the frontend rebuild.
**Placeholder scan:** none — concrete tasks; the edge API exists; verification is typecheck + preview.
