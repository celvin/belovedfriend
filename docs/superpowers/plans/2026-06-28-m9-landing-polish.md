# Milestone 9: Landing + Directory Polish — Implementation Plan

**Goal:** Elevate the platform landing (`/`) from functional to inviting, matching the warm serif memorial aesthetic, without changing data wiring.

## Global Constraints
- pnpm only; no tests; no secrets. Gate: `pnpm run typecheck` GREEN; visual check on preview.
- Keep the existing data: `useListTenants()` directory + the "Create a tribute page" CTA → /create. Reuse shadcn/ui + Tailwind theme (serif fonts, warm palette already in index.css). Stay tasteful and calm — this is a memorial platform, not a SaaS splash.

### Task 1: polish pages/landing.tsx
- [ ] A calm hero (existing headline ok) with softened background, generous spacing, clear primary CTA + a secondary "How it works" anchor.
- [ ] A 3-step "How it works" section: 1) Create a page  2) Share the link  3) Friends leave tributes & pins — short copy, simple icons (lucide).
- [ ] A refined **directory** grid: each public tenant as a warm card (friendName, tagline, "Visit" affordance) linking to /<slug>; graceful empty state (current "Be the first to create one.").
- [ ] A short reassuring footer line about the platform.
- [ ] `pnpm run typecheck` GREEN. Commit: `feat(web): polish platform landing + directory`.
