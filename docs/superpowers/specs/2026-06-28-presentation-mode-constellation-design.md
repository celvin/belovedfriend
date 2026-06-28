# Presentation Mode ("Tribute Theater") + Constellation Glow-Up — Design

**Date:** 2026-06-28
**Status:** Approved (design direction confirmed by owner)

## Goal

Give every friend's page a **fullscreen, auto-playing, looping cinematic showcase** that can be projected at a memorial gathering and left running — it presents everything created for that friend (photos, cards, messages, videos, and the map of connected places) with special effects, and **polls for new uploads** so freshly added memories appear automatically. Also **upgrade the existing Constellation view** with richer visuals.

## Confirmed decisions

1. **Scope:** full cinematic showcase — title scene + airplane "journey" across the map + photo/video memory slideshow + live polling + autoplay.
2. **Constellation glow-up:** bundled into this same effort.
3. **Video audio:** auto-played videos **start muted** with an always-available **unmute** control (muted autoplay is universally allowed by browsers; safe for quiet/shared rooms).

## A) Presentation Mode — "Tribute Theater"

**Entry:** a **▶ Present** button on the map toolbar (`reach-network.tsx`) and the home hero. Route: **`/:slug/present`**, rendered **outside the normal Layout** (no nav/footer — fully immersive). On enter, request fullscreen and auto-hide the cursor/controls after idle.

**Data:** `useGetReach(slug)` (nodes + edges), `useListMessages(slug, {type: all})`, `useGetTenant(slug)` — all with a TanStack `refetchInterval` of ~25s (the polling). New tributes are appended to the show queue between loops; a gentle "✨ a new memory just arrived" flourish features the newest one.

**Scene engine:** a small state machine cycling scenes. Each scene has a duration (timer-driven); video scenes advance on the `ended` event instead of a timer. `AnimatePresence` (framer-motion) cross-fades between scenes. Scenes:

1. **Title** — friend's hero photo, name, year range, tagline; slow zoom + drifting ember particles; ~6s.
2. **Journey** ✈️ — the world map (reusing the `geoNaturalEarth1` projection). An airplane marker flies along each reach **edge** in sequence: interpolate along the quadratic-bezier connection path via `requestAnimationFrame`, rotating the plane to face travel direction, leaving a glowing dashed trail. On arrival, the destination marker blooms and its label + memory count rise in. A slow Ken Burns pan/zoom follows the plane. If there are no edges, gently pan across the plotted markers instead.
3. **Memories** — each tribute full-screen, one per scene:
   - **Photo / card** (`photoPath` / card): full-bleed image with a slow Ken Burns zoom; caption (author · relationship · location · message) fades in; ~7s.
   - **Video**: `<video autoPlay muted playsInline>`, full-screen `object-contain`; the scene holds until `onEnded`, then advances. An unmute toggle controls `muted`.
   - **Text-only card** (no photo): elegant typographic slide over a soft gradient.
4. **Loop:** after the last memory, return to Title and repeat. Newly polled memories are merged into the queue at the loop boundary (and the newest gets a one-off featured flourish).

**Controls:** an overlay bar that auto-hides ~3s after the last pointer move (cursor hidden too): ⏯ play/pause, ⏮ ⏭ prev/next, 🔊/🔇 mute, ⛶ exit (exit fullscreen + navigate back to `/:slug`). Keyboard: Space = pause, ← → = prev/next, M = mute, Esc = exit.

**Empty state:** if there are no memories yet, show the Title scene with a calm "memories will appear here as they're shared" line and keep polling.

## B) Constellation glow-up

Enhancements to the existing constellation branch in `reach-network.tsx` (and a small `Starfield` helper):

- **Starfield backdrop** — a layer of faint, slowly twinkling stars behind the graph for depth.
- **Glowing, breathing nodes** — soft pulsing halos (animated radius/opacity); brighter bloom on hover/selected.
- **Flowing edges** — light "energy" travels along each connection (animated `strokeDashoffset` and/or a moving particle), instead of static lines.
- **Smoother drift** — gentle gravity toward center + soft easing so nodes settle rather than wander.
- **Accent-tied palette** — edge/glow colors derive from the page's `theme.accent`.

## File structure

- `artifacts/memorial/src/pages/present.tsx` — the presentation page + scene orchestration (state machine, polling, controls, fullscreen).
- `artifacts/memorial/src/components/presentation/title-scene.tsx`
- `artifacts/memorial/src/components/presentation/journey-scene.tsx` — map + airplane animation.
- `artifacts/memorial/src/components/presentation/memory-scene.tsx` — photo/card/video rendering.
- `artifacts/memorial/src/components/presentation/presentation-controls.tsx` — auto-hiding control bar + keyboard.
- `artifacts/memorial/src/components/starfield.tsx` — reusable twinkling backdrop (used by constellation + title).
- **Modify:** `App.tsx` (add `/:slug/present` outside Layout), `reach-network.tsx` (Present button + constellation enhancements), `world-map.tsx` (optional: share projection helper if convenient).

No backend or schema changes — everything is read-only over existing endpoints. No new dependencies (framer-motion, d3-geo, d3-zoom already present).

## Verification

`pnpm run typecheck` green; deploy preview; Playwright load of `/luisventura/present` — confirm scenes advance, the journey/airplane renders, zero console errors, and a screenshot of each scene. Autoplay-with-sound paths are verified by manual check (the owner) since headless audio isn't meaningful; muted autoplay is verifiable headless.

## Self-review

- **Placeholders:** none — concrete components, scene engine, and animation approach specified.
- **Consistency:** read-only over existing data; muted-autoplay decision matches browser constraints; entry points and route defined.
- **Scope:** one cohesive feature (presentation mode) + a bounded visual enhancement (constellation). Buildable as a single plan.
- **Ambiguity:** video advance = on `ended`; photo/card = fixed duration; loop merges polled memories at the boundary — all made explicit.
