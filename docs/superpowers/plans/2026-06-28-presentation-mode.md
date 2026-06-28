# Presentation Mode ("Tribute Theater") + Constellation Glow-Up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** A fullscreen, looping, auto-playing cinematic showcase at `/:slug/present` (title → airplane map journey → photo/video memory slideshow → loop, with live polling), plus a richer Constellation view.

**Architecture:** A new immersive page (`present.tsx`) rendered OUTSIDE the site Layout, driving a scene state machine over read-only data (`useGetReach`, `useListMessages`, `useGetTenant`) with `refetchInterval` polling. Scenes are framer-motion components cross-faded via `AnimatePresence`. The constellation enhancements live in `reach-network.tsx` + a shared `Starfield`.

**Tech Stack:** React 19, wouter, TanStack Query (generated hooks), framer-motion, d3-geo (`geoNaturalEarth1`), Tailwind v4. No new dependencies. No backend/schema changes.

## Global Constraints
- pnpm only; **no test suite** — gate every task on `pnpm run typecheck` GREEN + a deploy-preview Playwright check (scenes render, zero console errors, screenshot). Do not invent a test framework.
- Read-only over existing endpoints; do not add routes/columns.
- Videos: `autoPlay muted playsInline`, advance on `ended`; unmute is a control (decision: start muted).
- Immersive route must NOT render the global nav/footer (Layout) — register it separately in `App.tsx`.
- Reuse existing generated hooks/types from `@workspace/api-client-react`; `customFetch` baseUrl is `/api`; media is served at `/api{path}`.
- Shared design tokens (timings, colors) live in one module so all scenes feel cohesive.

---

### Task 1: Immersive route, data + polling shell, entry buttons, fullscreen

**Files:**
- Create: `artifacts/memorial/src/pages/present.tsx`
- Create: `artifacts/memorial/src/components/presentation/constants.ts` (shared tokens)
- Modify: `artifacts/memorial/src/App.tsx` (add `/:slug/present` OUTSIDE `<Layout>`)
- Modify: `artifacts/memorial/src/components/reach-network.tsx` (▶ Present button in map toolbar)
- Modify: `artifacts/memorial/src/pages/home.tsx` (subtle "Play the tribute" entry near hero CTAs)

**Interfaces — Produces:**
- `present.tsx` default export `Present()` reading slug via `useTenantSlug()`.
- `constants.ts`: `SCENE_MS = { title: 6000, photo: 7000 }`, `POLL_MS = 25000`, `PALETTE` (ink `#0e0b07`, etc.).

Steps:
- [ ] **1.1** `constants.ts` with the tokens above.
- [ ] **1.2** `present.tsx`: fetch `useGetReach(slug)`, `useListMessages(slug, {type:"all"})`, `useGetTenant(slug)` each with `query.refetchInterval: POLL_MS`. Render a fixed, full-viewport black container (`fixed inset-0 z-[100] bg-[#0e0b07] text-white overflow-hidden`). On mount, `containerRef.current.requestFullscreen().catch(()=>{})`; provide an Exit button (top-right) that exits fullscreen + `setLocation('/'+slug)`. Show a centered "Preparing…" while loading and a calm empty state if no memories.
- [ ] **1.3** `App.tsx`: add `<Route path="/:slug/present"><Present/></Route>` registered so it renders WITHOUT `<Layout>` (mirror how platform routes are structured; the present page is self-contained fullscreen).
- [ ] **1.4** reach-network toolbar: add a `▶ Present` button (lucide `Play`) linking to `/${slug}/present` (always visible — viewing is public).
- [ ] **1.5** home hero: add a quiet "▶ Play the tribute" link/button to `/${slug}/present`.
- [ ] **Gate:** `pnpm run typecheck` GREEN. Commit `feat(web): presentation route shell + entry points + fullscreen`.

---

### Task 2: Scene engine + auto-hiding controls

**Files:** Modify `artifacts/memorial/src/pages/present.tsx`; Create `artifacts/memorial/src/components/presentation/presentation-controls.tsx`.

**Interfaces — Produces:**
- Scene list type: `type Scene = {kind:'title'} | {kind:'journey'} | {kind:'memory', message: Message}`.
- `buildScenes(messages): Scene[]` → `[{title}, {journey}, ...memories]`.
- `<PresentationControls playing onToggle onPrev onNext muted onMute onExit visible />`.

Steps:
- [ ] **2.1** In `present.tsx`, compute `scenes = useMemo(()=>buildScenes(messages, hasEdges), …)`. Track `index` + `playing`. Advance via `setTimeout(SCENE_MS[...])` for title/photo/journey; **memory-video scenes advance on the child's `onEnded`** (no timer). Wrap timer in an effect keyed on `[index, playing, scenes]`; clear on cleanup. Loop: `next = (i+1) % scenes.length`.
- [ ] **2.2** Cross-fade scenes with `<AnimatePresence mode="wait">` keyed on `index`; render placeholder `<div>scene.kind</div>` for now.
- [ ] **2.3** `presentation-controls.tsx`: bottom-center bar (play/pause, prev, next, mute, exit) with framer fade; auto-hide after 3s idle — track last pointer move via a `mousemove` window listener resetting a timer; hide cursor (`cursor-none`) when hidden. Keyboard: Space=toggle, ←/→=prev/next, M=mute, Esc=exit.
- [ ] **Gate:** typecheck GREEN; preview: scenes cycle, controls show on move + hide after idle. Commit `feat(web): scene engine + auto-hiding presentation controls`.

---

### Task 3: Starfield + Title scene

**Files:** Create `artifacts/memorial/src/components/starfield.tsx`, `artifacts/memorial/src/components/presentation/title-scene.tsx`; Modify `present.tsx` (render TitleScene).

**Interfaces — Produces:**
- `<Starfield count?=number className?>` — absolutely-positioned twinkling dots (SVG circles, animated opacity via CSS keyframes; deterministic positions seeded by index — NO Math.random in render, use a hashed index so SSR/rerender stable).
- `<TitleScene tenant heroPhotoPath />`.

Steps:
- [ ] **3.1** `Starfield`: `N` dots positioned via `((i*97)%100)%` math for x/y; each `<circle>` with `animation: twinkle Xs ease-in-out infinite` (stagger by index). Add the `@keyframes twinkle` to `index.css`.
- [ ] **3.2** `TitleScene`: centered hero photo (rounded, ring), name (large serif), year range, tagline; slow scale (`whileInView`/`animate` scale 1→1.06 over the scene), Starfield behind. Accent from `tenant.pageConfig.theme.accent`.
- [ ] **3.3** Wire into `present.tsx` for `scene.kind==='title'`.
- [ ] **Gate:** typecheck GREEN; preview screenshot of title scene. Commit `feat(web): starfield + title scene`.

---

### Task 4: Memory scene (photo / card / video)

**Files:** Create `artifacts/memorial/src/components/presentation/memory-scene.tsx`; Modify `present.tsx`.

**Interfaces — Consumes:** `Message` (fields: `type`, `photoPath`, `videoPath`, `card`, `body`, `authorName`, `relationship`, `location`).
**Produces:** `<MemoryScene message muted onEnded />` — calls `onEnded()` when a video finishes (photo/card scenes are advanced by the engine timer, not this).

Steps:
- [ ] **4.1** Video branch: full-screen `<video src={`/api${videoPath}`} autoPlay muted={muted} playsInline className="w-full h-full object-contain" onEnded={onEnded} />`. Caption overlay (author · relationship · location) bottom-left, fading.
- [ ] **4.2** Photo/card branch: full-bleed `<img src={`/api${photoPath}`}>` with a slow Ken Burns (`animate` scale 1.05→1.15, slight translate) + dark gradient scrim; caption + message text fade in. If card with no photo: typographic slide over a soft accent gradient using `card.body || body`.
- [ ] **4.3** Wire `scene.kind==='memory'` → `<MemoryScene message={scene.message} muted={muted} onEnded={goNext} />`; ensure the engine does NOT also set a timer for video scenes.
- [ ] **Gate:** typecheck GREEN; preview: a photo memory shows with caption; a video scene plays muted and advances. Commit `feat(web): memory scene (photo/card/video, autoplay+advance)`.

---

### Task 5: Journey scene (map + airplane travel)

**Files:** Create `artifacts/memorial/src/components/presentation/journey-scene.tsx`; Modify `present.tsx`.

**Interfaces — Consumes:** reach `nodes` (with `lat`/`lng`/`label`) + `edges` (`sourceNodeId`,`targetNodeId`).
**Produces:** `<JourneyScene nodes edges width height onDone? />`.

Steps:
- [ ] **5.1** Build a `geoNaturalEarth1()` projection sized to the viewport; draw the world (reuse the topojson loader pattern from `world-map.tsx` — extract a shared `useWorldFeatures()` hook if convenient, else duplicate the small loader). Plot nodes.
- [ ] **5.2** For each edge in order, define the quadratic path `M sx sy Q mx my tx ty` (control point lifted above midpoint). Animate an ✈️ marker (rotated to travel direction) along the curve with `requestAnimationFrame`, interpolating the bezier `B(t)`; leave a growing glowing dashed trail (`stroke-dasharray` reveal). On arrival, bloom the destination marker + raise its label. Advance to the next edge; when all done, hold briefly then `onDone?.()`.
- [ ] **5.3** Camera: a wrapping `<g>`/container with a slow scale+translate easing toward the active segment's midpoint (Ken Burns). If `edges.length===0`, slowly pan across the plotted nodes instead.
- [ ] **5.4** Wire `scene.kind==='journey'` in `present.tsx`; the engine gives it a duration (e.g. `max(6000, edges*1600)`).
- [ ] **Gate:** typecheck GREEN; preview screenshot mid-journey showing the plane + trail. Commit `feat(web): journey scene — airplane travels the connected map`.

---

### Task 6: Live polling + new-memory flourish

**Files:** Modify `artifacts/memorial/src/pages/present.tsx`.

Steps:
- [ ] **6.1** Polling is already on via `refetchInterval` (Task 1). Keep a ref of the previously-seen message ids; when the messages list grows, compute the new ones.
- [ ] **6.2** Merge new memories into `scenes` at the **loop boundary** (when index wraps to 0) so the running scene isn't interrupted mid-play. Track the newest new id; the first time its memory scene shows, overlay a brief "✨ A new memory just arrived" flourish (framer fade, ~2.5s) then continue.
- [ ] **6.3** Guard against duplicate scenes (dedupe by message id).
- [ ] **Gate:** typecheck GREEN; preview: load, confirm no console errors and the queue length reflects current messages. Commit `feat(web): presentation polls for new memories + featured flourish`.

---

### Task 7: Constellation glow-up

**Files:** Modify `artifacts/memorial/src/components/reach-network.tsx` (constellation branch); reuse `Starfield`; add keyframes to `index.css`.

Steps:
- [ ] **7.1** Render `<Starfield>` behind the constellation `<svg>` (only in constellation view).
- [ ] **7.2** Nodes: add a pulsing outer halo (`animate` r/opacity loop) and a brighter bloom when hovered/selected; size by category as today.
- [ ] **7.3** Edges: animate a flowing dashed line (`stroke-dasharray` + animated `stroke-dashoffset`) so light appears to travel along connections; color from `theme.accent` (fallback current).
- [ ] **7.4** Drift: add a gentle pull toward center so nodes settle (clamp velocity), keeping the existing pause-on-select.
- [ ] **Gate:** typecheck GREEN; preview screenshot of the enhanced constellation; zero console errors. Commit `feat(web): constellation glow-up — starfield, glowing nodes, flowing edges`.

---

## Self-Review

**Spec coverage:** title ✓(T3) journey/airplane ✓(T5) photo/card/video slideshow ✓(T4) loop+engine ✓(T2) polling+flourish ✓(T6) fullscreen+controls ✓(T1,T2) entry points ✓(T1) muted+unmute ✓(T4) constellation glow-up ✓(T7). All spec items mapped.

**Placeholder scan:** none — concrete components, the bezier-interpolation airplane approach, autoplay/advance contract, and polling-merge-at-loop-boundary are all specified. (`requestAnimationFrame` is allowed in components; only `Math.random`/`Date.now` are banned in *workflow scripts*, not app code — but Starfield uses hashed-index positions anyway for stable renders.)

**Type consistency:** `Scene` union, `buildScenes`, `<MemoryScene message muted onEnded>`, `<JourneyScene nodes edges>`, `<Starfield>`, `<PresentationControls>` and `constants.ts` tokens are referenced consistently across tasks.
