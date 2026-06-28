# belovedfriend.org — Multi-Tenant Tribute Platform

**Status:** Approved design — ready for implementation plan
**Date:** 2026-06-28
**Owner:** crivas@cikume.com

## 1. Purpose

Convert the single-tenant "In Memory of Luis Ventura" memorial site into **belovedfriend.org**, a platform where anyone can create and manage their own online tribute page for a beloved friend, addressed at `belovedfriend.org/<slug>`. The existing Luis site and its collected tributes are migrated in as the first tenant.

This is delivered as **one comprehensive spec**, but built in ordered milestones (§18) so the work lands incrementally and stays verifiable.

## 2. Approved decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Build strategy | One comprehensive spec, milestone-sequenced |
| Tenant data isolation | Shared Postgres DB + `tenant_id` on every tenant-owned row |
| Page customization depth | Editable **structured sections** (no free-form page builder) |
| Existing Luis data | **Migrate** in as tenant `luisventura`; `luisventura.org` redirects to `/luisventura` |
| Roles | Platform **super-admin** (crivas@cikume.com) + one **per-tenant owner** (first claimer) |
| Participation | **Sign-in required** (magic link) to leave a tribute, add a map node/connection, or drop a pin |
| Moderation unit | Tributes + reach nodes/edges are the content; "block" = bar an account from contributing to that tenant |
| Map | **Generalize** the existing reach component (constellation + world map), DB-backed & visitor-contributed; **no Leaflet** |
| New-page gating | **Instant publish** + reserved-slug list; super-admin can suspend abusive pages |
| Backend host | **Netlify Functions** (single repo, push-to-deploy) wrapping the existing Express app |
| Object storage | **Netlify Blobs** only; video capped (~20 MB) via constrained in-browser recording |
| Custom domains | Out of scope for v1 (path-based only, plus the Luis redirect) |
| Root page | Marketing landing + "Create a tribute page" CTA + public directory; **no payments/ads network** |
| Luis tenant owner | crivas@cikume.com |
| Links feature | New owner-curated **"Links"** content type, 4th filter on the Wall |

## 3. Core model & terminology

- A **tenant** = one tribute page ("a friend"), at `belovedfriend.org/<slug>`.
- A **user** = one global identity (email + magic link). One user may **own multiple tenants** and **contribute to many**.
- The session cookie is a **single global identity**. Authorization is computed **per-tenant, per-request**: "is this user the owner of *this* tenant?" / "is this user blocked on *this* tenant?" What is "tied to the friend URL" is the **post-login redirect** plus the fact that all content APIs are **scoped to one tenant**.
- **Roles:**
  - **Platform super-admin** — `users.role = 'admin'` (crivas@cikume.com, auto-promoted on first verify). Can edit/moderate/suspend any tenant.
  - **Tenant owner** — `tenants.owner_user_id`. Edits and moderates only their page.
  - **Contributor** — any signed-in, non-blocked user.

## 4. Data model (Drizzle / Postgres, shared DB)

### 4.1 New table `tenants`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| slug | text unique not null | `^[a-z0-9-]{3,40}$`, not reserved |
| friend_name | text not null | |
| birth_year | integer | nullable |
| death_year | integer | nullable |
| tagline | text | nullable |
| owner_user_id | integer FK → users.id | not null |
| status | text not null default `'active'` | `'active' | 'suspended'` |
| page_config | jsonb not null | structured section config (§8) |
| created_at | timestamptz not null default now() | |

Index: `tenants.slug` (unique already), `tenants.owner_user_id`.

### 4.2 New table `reach_nodes`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| tenant_id | integer FK → tenants.id | indexed, not null |
| label | text not null | |
| category | text not null | generalized set (§10) |
| lat | double precision | nullable; present ⇒ shows on world map |
| lng | double precision | nullable |
| note | text | nullable |
| is_anchor | boolean not null default false | the seeded center node (the friend) |
| created_by_user_id | integer FK → users.id | nullable for seeded/migrated nodes |
| created_at | timestamptz not null default now() | |

### 4.3 New table `reach_edges`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| tenant_id | integer FK → tenants.id | indexed, not null |
| source_node_id | integer FK → reach_nodes.id | on delete cascade |
| target_node_id | integer FK → reach_nodes.id | on delete cascade |
| created_by_user_id | integer FK → users.id | nullable |
| created_at | timestamptz not null default now() | |

Unique on `(tenant_id, source_node_id, target_node_id)`.

### 4.4 New table `tenant_blocks`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| tenant_id | integer FK → tenants.id | indexed, not null |
| user_id | integer FK → users.id | the blocked person |
| blocked_by_user_id | integer FK → users.id | |
| created_at | timestamptz not null default now() | |

Unique on `(tenant_id, user_id)`.

### 4.5 Changes to existing tables
- **`messages`**
  - Add **`tenant_id`** (integer FK → tenants.id, indexed, not null). All tribute queries filter by it.
  - `type` enum widened to **`'card' | 'video' | 'link'`**.
  - Add **`url`** (text, nullable) — target for `type:'link'`.
  - Add **`node_id`** (integer FK → reach_nodes.id, nullable, on delete set null) — optional attachment of a tribute to a map node/place (replaces today's fuzzy city-name matching).
- **`magic_links`**
  - Add **`redirect_to`** (text, nullable) — where `verify` should bounce the user after sign-in (e.g. `/luisventura/compose`).
  - (Optional) Add `tenant_id` (nullable) for analytics; redirect_to is the functional field.
- **`users`** — unchanged (global identity; `role` = platform admin flag).

### 4.6 Rate-limit storage
The in-memory magic-link rate limiter does not survive serverless. Replace with a DB-backed check: count recent `magic_links` rows per `email` and per request IP within the window (1h, max 5). IP is recorded on the row (add nullable `request_ip` to `magic_links`) or counted via a small `rate_events` table. Chosen approach: **add `request_ip` to `magic_links`** and count rows in-window — no extra table.

## 5. URL routing & reserved slugs

Frontend uses `wouter`; the tenant slug is the **first path segment**. Route order (most specific first; `/:slug` matches last):

| Path | Page |
|---|---|
| `/` | Platform landing (marketing) |
| `/sign-in` | Token verify → redirect to `redirect_to` |
| `/create` | Claim-a-page form (requires sign-in) |
| `/dashboard` | List of pages the signed-in user owns |
| `/:slug` | Tenant home |
| `/:slug/wall` | Tribute wall (All / Cards / Videos / Links) |
| `/:slug/map` | Memory Map & Constellation |
| `/:slug/compose` | Leave a tribute (sign-in) |
| `/:slug/manage` | Owner edit + moderation (owner / super-admin) |

**Reserved slugs** (rejected at claim time): `api, sign-in, signin, create, dashboard, admin, login, logout, www, about, pricing, terms, privacy, help, support, contact, static, assets, public, t`. Server-side reserved check at claim; client mirror for UX only.

Netlify serves the SPA with `/* → /index.html 200`; `/api/*` is server-side (Functions) and excluded from the SPA fallback.

## 6. Auth, sessions & tenant-scoped magic links

- Keep magic-link + JWT cookie (`lv_session`, HttpOnly/Secure/SameSite=lax/30d). **Preserve the atomic conditional-UPDATE consume** in `auth.ts` — do not refactor to select-then-update.
- `POST /api/auth/request-link` accepts optional `slug` + `intent` (e.g. `compose`, `map`, `create`) and computes `redirect_to`, stored on the magic-link row. The email lands the user **back on that friend page/action**, never the root or another page.
- `POST /api/auth/verify` returns `{ user, redirectTo }`; the SPA navigates to `redirectTo` (default `/dashboard` if none).
- Claiming a new page: sign in at `/create` with `redirect_to=/create`.
- `ADMIN_EMAIL` (crivas@cikume.com) auto-promotes to super-admin on first verify (preserved).
- Session payload stays `{ uid, email, role }` (role = platform admin flag only). Per-tenant ownership and blocks are resolved per request from `tenants` / `tenant_blocks`.

## 7. Tenant registration (claim flow)

`/create` (signed-in) submits: friend name, birth/death years (optional), tagline (optional), desired slug.

Server:
1. Validate slug format + reserved list.
2. **Atomic insert** relying on the unique constraint (no check-then-insert race); on conflict → 409 "slug taken".
3. Set `owner_user_id` = claimer, seed default `page_config` (§8) and a single **anchor `reach_node`** (label = friend_name, `is_anchor = true`).
4. Status `active` → page is **live immediately**.

Form does a live availability check (`GET /api/tenants/:slug/availability`), advisory only; the insert is the source of truth.

No per-user page-count cap in v1; super-admin suspends abuse via `status='suspended'`.

## 8. Owner page editing (structured sections)

`tenants.page_config` is a **versioned jsonb** object validated by a Zod schema. A bad/unknown save is rejected so a page can never be broken by malformed config. Shape (v1):

```jsonc
{
  "version": 1,
  "theme": { "palette": "warm", "accent": "#7a4a1f", "font": "serif" },
  "hero": { "heroPhotoPath": null, "showDates": true },
  "story": { "enabled": true, "blocks": [ { "heading": "", "body": "" } ] },
  "sections": { "order": ["story", "wall", "reach"],
                "story": true, "wall": true, "reach": true },
  "reachSummary": [ { "label": "Memories", "derived": "nodeCount" } ],
  "cta": { "primaryLabel": "Leave a tribute", "wallLabel": "Read tributes" }
}
```

`/:slug/manage` renders the live page with inline edit controls for owner / super-admin; saved via `PATCH /api/tenants/:slug` (page_config + tenant meta). `font` reuses the app's existing serif / sans / handwriting options. `reachSummary` items are either a fixed `value` (owner-set callout, used for Luis's "lives touched" numbers) or a `derived` key the server computes (`nodeCount`, `placeCount`, `contributorCount`, `countryCount`).

## 9. Tributes + Wall (Cards / Videos / Links)

- Tributes are tenant-scoped. **Cards** (designed condolence, `card` jsonb) and **Videos** (recorded) are contributed by any signed-in, non-blocked user via `/:slug/compose`.
- **Links** (`type:'link'`) are **owner / super-admin only**: a pinned URL with a short note (`body`) and optional title (`authorName`). Validated to **http(s) only** (reject `javascript:` / `data:`). Rendered on the Wall and opened in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Wall filters: **All / Cards / Videos / Links**.
- `POST /api/t/:slug/messages` enforces: `type:'link'` ⇒ owner/super-admin; `type:'card'|'video'` ⇒ signed-in + not blocked. Video requires an uploaded `videoPath`.

## 10. Memory Map & Constellation (generalized reach)

**Reuse + generalize** the existing `ReachNetwork` (constellation SVG, force-drift) and `WorldMap` (d3-geo `geoNaturalEarth1` + topojson) components and their two-view toggle. Replace hardcoded `reach.ts` with **DB-backed, tenant-scoped `reach_nodes` / `reach_edges`**.

**Visitor contributions ("connections")** — signed-in, non-blocked:
- Add a **node**: a memory / place / person / moment. Optional **location** (click the map, or "use my location" via browser geolocation) ⇒ appears as a **world-map marker**. Optional category, note, and optionally attach a tribute (the existing "record here" flow, now via `messages.node_id`).
- Add an **edge** (connection) between two nodes. New nodes **auto-connect to the tenant anchor node**; visitors can draw additional connections. Edges render in the constellation view.

**Generalized categories** (replacing project/city/agency/community/team/wonder): default set **`person | place | memory | milestone | passion`** with assigned colors; owner may customize labels/colors in `page_config` later (v1 ships the fixed set). Luis's existing categories are migrated to the generalized set via a fixed mapping, and his specific colors/labels are preserved in his `page_config` so his page renders unchanged.

**Revamp features:** ⛶ **Fullscreen button** (Fullscreen API on the canvas container); "Add to the map" flow (node + connect); node search/filter; contributor attribution on node popovers; **derived summary strip** (counts) replacing Luis's hardcoded numbers; **bundle the world topojson as a local static asset** instead of the jsdelivr CDN fetch (keep the existing "Map unavailable / Retry" fallback).

**API:**
- `GET /api/t/:slug/reach` → `{ nodes, edges, summary }`
- `POST /api/t/:slug/reach/nodes`, `POST /api/t/:slug/reach/edges` (sign-in + not blocked)
- `DELETE /api/t/:slug/reach/nodes/:id` (cascades edges), `DELETE /api/t/:slug/reach/edges/:id` (owner / super-admin)

## 11. Moderation & blocking

`/:slug/manage` (owner / super-admin) moderation tab:
- List & **delete** any tribute, reach node (cascades its edges), or reach edge.
- **Block** a contributor's account on this tenant (`tenant_blocks`); blocked users get **403** on any contribution to that tenant only.
- Deleting a tribute also deletes its stored media (existing cleanup logic, adapted to Netlify Blobs delete).
- A dedicated **Links** sub-panel to add/edit/remove owner links.

## 12. Platform landing & dashboard

- **`/`** — marketing landing: what belovedfriend.org is, prominent **"Create a tribute page"** CTA, and a **directory** of public (active) tenants. No ad network, no billing.
- **`/dashboard`** — signed-in user's owned pages with links to manage each.

## 13. Storage (Netlify Blobs, video capped)

- Single `@netlify/blobs` store, keys **namespaced per tenant**: `tenants/<slug>/<uuid>`.
- **Images / card assets**: uploaded through an upload Function (well under the 6 MB buffered limit).
- **Video**: in-browser `MediaRecorder` constrained — **max ~90 s** + capped `videoBitsPerSecond` (~1.5 Mbps) + a hard **client-side size check (~18 MB)** before upload — then **streamed through a Function into Blobs** (Function streamed-payload limit is 20 MB). Over-cap uploads are rejected with a clear message.
- Serving: a Function streams blobs out with appropriate `Content-Type` and cache headers. Public vs. private handled by store/key convention.
- The current GCS-based `objectStorage.ts` / signed-URL flow is **replaced** by a Blobs-backed storage module exposing the same interface used by routes (request-upload, serve, delete).

## 14. Backend on Netlify Functions

- Wrap the **existing Express app in one catch-all Function** at `/api/*` (e.g. via `serverless-http`), preserving the route code. Functions live in `netlify/functions/`.
- **Rate limiter** → DB-backed (§4.6).
- **pino** logging → simple synchronous transport (no worker threads in Functions); drop the esbuild pino worker plugin from the Functions build path.
- Env via `process.env` (works in Node Functions); secrets set as Netlify env vars.
- The existing esbuild bundling for Railway is retired; build target becomes the Netlify Functions bundler. Keep the shared `@workspace/*` imports working under the Functions build.

## 15. Infra / deploy / config

- **Frontend**: Vite SPA, Netlify static build, auto-deploy on push. `netlify.toml`: build the memorial app, publish its `dist`, set `functions` dir, SPA fallback `/* → /index.html 200`, and ensure `/api/*` routes to the catch-all Function.
- **Database**: Netlify DB (managed Neon). **Create database `belovedfriend_db`** on the provided Netlify Neon server and point `DATABASE_URL` at it; apply schema via `pnpm --filter @workspace/db run push`.
- **Email**: Resend, domain `belovedfriend.org`, from `noreply@belovedfriend.org`. Credentials live in the untracked `secret.txt` (gitignored) and are set as Netlify env vars — **never committed**.
- **Secrets handling**: `secret.txt` stays gitignored; all live values (LUIS DB URL, Netlify DB URL, Resend key) are entered into Netlify env vars and referenced via `process.env`. No secret values appear in the repo or this spec.
- Required env (Netlify): `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_BASE_URL=https://belovedfriend.org`, plus any Blobs config (Blobs is zero-config on Netlify compute).

## 16. Luis migration & schema.sql refresh

1. **Refresh `db-export/schema.sql`** from the live LUIS database (verify it matches current Drizzle schema before changes).
2. Provision `belovedfriend_db` and apply the new multi-tenant schema.
3. Seed tenant **`luisventura`** (friend_name "Luis Ventura", years 1965–2026, `owner_user_id` = crivas@cikume.com account).
4. **Import** existing `users` (global identities) and `messages` from LUIS; set every imported message's `tenant_id` to the Luis tenant.
5. Seed Luis's `reach_nodes` / `reach_edges` from the current static `reach.ts` data; map his categories to the generalized set (or preserve as custom colors) and store his "lives touched / years of service / wonders" figures as owner-set `reachSummary` callouts so his page renders unchanged.
6. Migrate media: existing Luis objects are in GCS. Either (a) copy referenced objects into Netlify Blobs under `tenants/luisventura/...` and rewrite paths, or (b) keep a read-only GCS fallback for legacy Luis media. **Decision for plan phase:** prefer (a) full copy so the platform has a single storage backend; fall back to (b) only if object volume makes copy impractical.
7. Point `luisventura.org` to redirect (301) to `belovedfriend.org/luisventura`.

## 17. API surface (summary)

```
# Auth (platform-level)
POST   /api/auth/request-link        { email, name?, slug?, intent? }
POST   /api/auth/verify              { token } -> { user, redirectTo }
GET    /api/auth/me
POST   /api/auth/logout

# Tenants
GET    /api/tenants                  # public directory (active)
GET    /api/tenants/:slug            # page config + meta
GET    /api/tenants/:slug/availability
POST   /api/tenants                  # claim (sign-in)
PATCH  /api/tenants/:slug            # edit page_config + meta (owner/super-admin)
GET    /api/tenants/mine             # dashboard list (sign-in)

# Tenant-scoped content
GET    /api/t/:slug/messages         ?type=all|card|video|link
POST   /api/t/:slug/messages         # card/video: signed-in+not-blocked; link: owner
GET    /api/t/:slug/messages/:id
PATCH  /api/t/:slug/messages/:id     # owner/super-admin
DELETE /api/t/:slug/messages/:id     # owner/super-admin
GET    /api/t/:slug/messages/stats

GET    /api/t/:slug/reach            -> { nodes, edges, summary }
POST   /api/t/:slug/reach/nodes      # signed-in+not-blocked
POST   /api/t/:slug/reach/edges      # signed-in+not-blocked
DELETE /api/t/:slug/reach/nodes/:id  # owner/super-admin
DELETE /api/t/:slug/reach/edges/:id  # owner/super-admin

# Moderation
POST   /api/t/:slug/blocks           { userId }  # owner/super-admin
DELETE /api/t/:slug/blocks/:userId

# Super-admin
PATCH  /api/admin/tenants/:slug      { status }  # suspend/reactivate

# Storage
POST   /api/storage/uploads          # image (through Function) / video (streamed, capped)
GET    /api/storage/objects/*        # serve from Blobs
```

All request/response shapes are defined in `lib/api-spec/openapi.yaml` and regenerated via `pnpm --filter @workspace/api-spec run codegen` (client hooks + Zod validators). Route handlers import the regenerated Zod schemas for `safeParse`.

## 18. Build milestones

1. **Data model & migrations** — new tables, `messages`/`magic_links` changes, indexes, DB-backed rate limit.
2. **Backend re-platform** — Express → Netlify Functions catch-all; Blobs storage module; pino sync logging.
3. **Tenancy core** — tenant CRUD, claim flow, reserved slugs, availability check.
4. **Tenant-scoped auth** — `redirect_to`, scoped sign-in landing, per-tenant authorization helpers (`requireOwner`, block checks).
5. **Tributes + Wall** — tenant-scoped messages, compose with capped video, Cards/Videos/**Links** filter.
6. **Memory Map & Constellation** — generalized reach (nodes/edges), contribution flow, fullscreen, local topojson.
7. **Owner page editing** — `page_config` schema + `/:slug/manage` inline editor.
8. **Moderation & blocking** — delete/block UI + enforcement, Links management panel.
9. **Platform landing + dashboard** — root marketing page, directory, `/dashboard`.
10. **Luis migration + deploy** — schema.sql refresh, data + media import, `luisventura.org` redirect, Netlify env + production deploy.

## 19. Out of scope (YAGNI for v1)

Custom per-tenant domains; payments / ad network / paid tiers; co-editors / multiple owners per page; a comment stream separate from tributes; per-user page-count caps; full free-form page builder; per-tenant custom category editor (ships fixed set, configurable later).

## 20. Risks & considerations

- **Capped video** is a deliberate UX constraint; longer/high-res recordings are rejected client-side. Messaging must be clear in the recorder.
- **Reach contributions are an abuse surface** (anyone signed in can add nodes/edges). Mitigated by sign-in requirement, per-tenant blocking, and super-admin suspension. Consider a soft per-user/day node cap if abused (not in v1).
- **Netlify Functions cold starts** add latency to API calls; acceptable for this app's traffic profile.
- **Slug squatting** is possible (instant publish). Reserved list + super-admin suspension are the v1 guardrails.
- **Luis media migration** volume is unknown; the plan picks copy-to-Blobs vs. GCS read-only fallback based on actual object count.
- **`messages.user_id`** is currently nullable; tenant-scoping and blocking rely on it being set for contributed tributes — enforce on new writes.
