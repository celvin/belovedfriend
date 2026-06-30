# Multilingual UI (EN / ES / FR) — Design

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Scope:** Frontend (`artifacts/memorial`) UI internationalization + a per-tenant default-language setting.

## Goal

Let visitors read the **UI chrome** of belovedfriend.org in English, Spanish, or French. Each tenant page has an owner-set default language; any visitor can override it with a header switcher. Translation files are served **uncached** so edits take effect immediately without a JS rebuild or stale-cache problems.

## Scope

**In scope — translated:** all hardcoded UI strings — navigation, buttons, form labels/placeholders, validation and toast/system messages, empty states, landing/marketing copy, presentation-mode chrome.

**Out of scope — stays as authored (never auto-translated):**
- Visitor-generated content: tributes, recorded videos, card messages, map-pin notes.
- Owner-authored per-tenant content in `pageConfig`: custom headlines, taglines, section copy, friend name. These are written once by the owner in their own language.

**No backend translation, no machine translation.** Translations are hand-maintained JSON files in the repo.

## Decisions (locked during brainstorming)

1. **Languages:** English (`en`, canonical/fallback), Spanish (`es`), French (`fr`).
2. **Scope:** UI chrome only (see above).
3. **Selection model:** per-tenant default language + a visitor switcher.
4. **Storage/delivery:** static JSON files in the repo, fetched at runtime, served with `Cache-Control: no-store`.
5. **Mechanism:** a tiny custom i18n context/hook — **no new dependencies** (respects `minimumReleaseAge: 1440` and the project's lean-dependency posture). Rejected react-i18next (~3 gated deps, ~40kb, overkill for UI chrome) and react-intl/FormatJS (heaviest, still needs custom runtime loading).
6. **First paint:** pure no-cache fetch gated by a brief minimal loader; **nothing bundled in**. (Bundled-English-fallback was offered as an alternative and not chosen.)
7. **Platform (non-tenant) pages** default to English — no browser auto-detection.

## Architecture

### Locale files
- Location: `artifacts/memorial/public/locales/{en,es,fr}.json`.
- Flat, namespaced dot-path keys, e.g.:
  ```json
  {
    "nav.home": "Home",
    "nav.tributes": "Tributes",
    "nav.reach": "Reach",
    "compose.submit": "Leave a Tribute",
    "wall.count_one": "{count} tribute",
    "wall.count_other": "{count} tributes"
  }
  ```
- `en.json` is canonical and the fallback source for any key missing in `es`/`fr`.
- Because files live in `public/`, their URLs are stable and **not content-hashed** (`/locales/es.json`). An edit reuses the same URL; `no-store` guarantees a fresh fetch. Vite serves them in dev; Netlify serves them in prod.

### No-cache delivery
- `netlify.toml` header rule:
  ```toml
  [[headers]]
    for = "/locales/*"
    [headers.values]
      Cache-Control = "no-store, must-revalidate"
  ```
- Client fetches with `{ cache: "no-store" }`.
- Static files take precedence over the SPA `/*` → `index.html` rewrite, so the real JSON is returned (not the HTML shell).

### Provider + hook
- `LanguageProvider` mounted in `App.tsx`, holding `{ lang, messages, fallbackMessages, setLang }`.
- `useT()` returns `t(key, vars?)`:
  - Looks up `key` in active `messages`, then `fallbackMessages` (en), then returns the key itself (dev-visible miss).
  - Interpolates `{var}` tokens from `vars`.
  - Pluralization helper uses `Intl.PluralRules(lang)` to pick `<key>_one` / `<key>_other` (and other CLDR categories where relevant) from a `{count}` value.
- On language change: fetch the target locale (no-store) and ensure `en` is loaded for fallback, then update context. Within a session the loaded messages are held in memory; a page reload re-fetches no-store, so edits propagate on refresh.
- **Initial render** is gated on the first locale load with a minimal loader (small same-origin fetch). Missing keys fall back to English.

### Language resolution precedence
1. Visitor's explicit choice — `localStorage["bf_lang"]` — always wins and persists.
2. Else, on a tenant route: tenant's `pageConfig.defaultLanguage`.
3. Else (platform pages / unset default): `en`.

On switch: update context, write `localStorage["bf_lang"]`, and set `document.documentElement.lang`.

### Per-tenant default language
- Stored in `pageConfig.defaultLanguage` (jsonb — **no DB migration**; already flows to the client via `useGetTenant`).
- Valid values: `"en" | "es" | "fr"`; treated as `"en"` when unset/invalid.
- A `<Select>` is added to the page-settings editor in `manage.tsx` so the owner can pick the page's default language. No OpenAPI/Zod change required beyond whatever already round-trips `pageConfig` (verify the update path accepts the new field; `pageConfig` is free-form jsonb).

### Language switcher (UI)
- A compact globe dropdown listing **EN / Español / Français**, added to:
  - the desktop nav in `layout.tsx`,
  - the mobile slide-down panel in `layout.tsx`.
- Selecting an option calls `setLang`, which persists and re-fetches as above.

## String migration

Replace hardcoded English literals with `t("…")` across:
`landing`, `layout`, `compose`, `wall`, `tribute`, `map`, `create`, `manage`, `dashboard`, `sign-in`, `home`, and the presentation scenes (`title-scene`, `journey-scene`, `memory-scene`, `presentation-controls`).

Process: build `en.json` while migrating each file, then produce `es.json` and `fr.json` from the finalized `en.json`. Keep keys grouped by page/feature namespace.

## Quality gate

- `pnpm run typecheck` is the structural gate (local Mac builds can't run vite/esbuild per the native-binary constraint in CLAUDE.md).
- Add a small dev-time parity check (script or a guarded console assert) that every key present in `en.json` also exists in `es.json` and `fr.json`, so translations don't silently drift as new keys are added.
- Manual verification: load a tenant page with each `pageConfig.defaultLanguage`, confirm switcher override + persistence across reloads, and confirm editing a `/locales/*.json` file then reloading shows the change without a rebuild.

## Non-goals / explicitly excluded

- Translating user-generated or owner-authored content.
- Machine/automatic translation.
- Browser-language auto-detection for platform pages.
- Localized routing (no `/es/...` URL prefixes); language is state, not a route.
- Localized date/number formatting beyond what `Intl.PluralRules` needs (can be added later if required).
- A live in-app translation editor (rejected storage option).

## Risks / notes

- **FOUC:** the brief loader before first locale load is accepted by design. If it proves objectionable, the fallback is to compile `en.json` in as an instant default while the no-store fetch refreshes in the background.
- **Missing keys** render English (fallback), not blanks — safe degradation.
- **`pageConfig` write path:** confirm the `/manage` save flow persists unknown `pageConfig` fields verbatim (it should, being jsonb) so `defaultLanguage` round-trips.
