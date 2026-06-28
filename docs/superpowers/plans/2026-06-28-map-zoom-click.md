# Map: zoom + click-to-add-a-pin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development / executing-plans.

**Goal:** Make the world map **zoomable/pannable** and let visitors **click the map to place a marker** — deriving lat/lng from the click via the d3 projection — so adding a place no longer requires typing coordinates.

**Architecture:** `world-map.tsx` (d3-geo `geoNaturalEarth1` SVG) gains d3-zoom (scroll/drag/pinch) applied as a transform on the map `<g>`, plus a click-to-pick handler that inverts screen→projection coords. `reach-network.tsx` wires an "Add a place" flow where the user clicks the map to set the location, then fills label/category/note (the manual lat/lng inputs go away when a location is picked).

Enhancement to the M6 map. Verified by typecheck + preview deploy (interactive — visually verify zoom + click).

## Global Constraints
- pnpm only; no tests; no secrets. Gate: `pnpm run typecheck` GREEN; visual check on preview.
- Add deps to `artifacts/memorial/package.json`: `d3-zoom@^3.0.0`, `d3-selection@^3.0.0`, dev `@types/d3-zoom@^3.0.8`, `@types/d3-selection@^3.0.11`. `pnpm install`.
- Don't regress: existing node select/hover, the constellation view, fullscreen, world-map rendering + retry.

---

### Task 1: Zoom/pan + click-to-pick on the world map
**Files:** `artifacts/memorial/src/components/world-map.tsx`.
- [ ] Add props: `addMode?: boolean` and `onPickLocation?: (lat: number, lng: number) => void`.
- [ ] **Zoom/pan:** create a `d3-zoom` behavior (`zoom().scaleExtent([1, 12])`), attach it to the `<svg>` via `select(svgRef).call(zoom)` in an effect; keep a `transform` state ({k,x,y}) updated on the zoom event. Wrap the existing countries + arcs + points groups in a single `<g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>`. To keep marks legible when zoomed, divide point radii and stroke widths by `transform.k` (clamp sensibly). Add small **"+" / "−" zoom buttons** (and a "reset") as an accessible alternative to scroll.
- [ ] **Click-to-pick:** render a full-size transparent `<rect>` (the click/pan surface) BEHIND the countries. On its click, when `addMode`: get the cursor position relative to the SVG (use the SVG's `getScreenCTM`/`clientX` math or `d3-selection pointer`), undo the zoom with `transform.invert([px,py])` → `[sx, sy]`, then `const ll = projection.invert([sx, sy])`; if `ll` is non-null call `onPickLocation(ll[1], ll[0])` (lat, lng). Node clicks must still `stopPropagation` so picking doesn't fire on a node. In `addMode` set `cursor: crosshair` and show a small hint ("Click anywhere to drop a pin").
- [ ] `pnpm run typecheck` GREEN. Commit: `feat(web): zoomable world map + click-to-pick a location`.

---

### Task 2: Wire click-to-pick into the add-a-place flow
**Files:** `artifacts/memorial/src/components/reach-network.tsx`.
- [ ] When the add panel's **"Add a place"** mode is active, switch the map to the **world map** view (so it's clickable) and pass `addMode={true}` + an `onPickLocation` to `<WorldMap>` that stores `{lat,lng}` in state and ensures the add form is shown.
- [ ] `AddNodeForm`: accept optional `presetLat`/`presetLng`. When set, REMOVE the manual Latitude/Longitude text inputs and instead show "📍 Location chosen on the map" with the rounded lat/lng and a "Pick a different spot" affordance (clears the preset so the next map click re-sets it). Submit uses the preset coords. (Keep a node addable without a location too — location optional — but the primary flow is click-to-place.)
- [ ] Make the instruction obvious: in add-place mode show a one-liner like "Click the map to choose where this memory belongs."
- [ ] `pnpm run typecheck` GREEN. Commit: `feat(web): click the map to set a new place's location (no typing coordinates)`.

---

## Self-Review
**Spec coverage:** zoomable/pannable map ✓; click-to-drop-a-pin with auto lat/lng ✓; no manual coordinate entry in the primary flow ✓.
**Placeholder scan:** none — concrete d3-zoom + projection.invert approach; verification is typecheck + interactive preview.
