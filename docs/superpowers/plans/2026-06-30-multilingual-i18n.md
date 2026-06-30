# Multilingual UI (EN / ES / FR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors read the UI chrome of belovedfriend.org in English, Spanish, or French, with a per-tenant default language and a header switcher, using runtime-fetched **uncached** locale files.

**Architecture:** A tiny custom i18n layer (no library). Pure helpers in `src/lib/i18n.ts` (fetch, interpolate, pluralize, translate); a `LanguageProvider` mounted inside the router holds the active language + loaded messages and exposes a `useT()` hook. Locale JSON lives in `public/locales/{en,es,fr}.json`, fetched with `cache: "no-store"` and served with a `no-store` CDN header. Per-tenant default language is stored in the existing `pageConfig` jsonb (no DB migration, no codegen).

**Tech Stack:** React 19, Vite, wouter, TanStack Query, TypeScript, Tailwind v4, Netlify (static hosting + headers). Spec: [docs/superpowers/specs/2026-06-30-multilingual-i18n-design.md](../specs/2026-06-30-multilingual-i18n-design.md).

## Global Constraints

- **pnpm only**, from repo root. No new dependencies (respects `minimumReleaseAge: 1440` and the project's lean-dependency posture). This feature adds **zero** packages.
- **Do not hand-edit** `lib/*/src/generated/` — but this feature needs **no** codegen change: `pageConfig` is `additionalProperties: true` (OpenAPI) / `zod.record(string, unknown)` (Zod), so `defaultLanguage` round-trips as a free-form jsonb field.
- **No test runner exists** in this repo. Per-task verification = `pnpm run typecheck` (structural gate) + `node scripts/check-locale-parity.mjs` (locale gate) + the concrete manual browser check named in the task. Do **not** add a test framework.
- **Local Mac builds fail** on `vite build`/esbuild (native-binary stripping); use `pnpm run typecheck` as the local gate, never `pnpm run build` locally.
- **Languages:** `en` (canonical + fallback), `es`, `fr`. Path alias `@/*` → `artifacts/memorial/src/*`.
- **Never translate** visitor content (tributes/videos/cards/pin notes) or owner-authored `pageConfig` values (friendName, custom headlines, taglines, story copy, CTA labels the owner typed). Only translate hardcoded UI literals.
- **es/fr files must contain real translations**, never English copies. The parity script checks key *presence*; you are responsible for actual translation quality.

---

### Task 1: Locale files + no-cache delivery + parity check

**Files:**
- Create: `artifacts/memorial/public/locales/en.json`
- Create: `artifacts/memorial/public/locales/es.json`
- Create: `artifacts/memorial/public/locales/fr.json`
- Create: `scripts/check-locale-parity.mjs`
- Modify: `netlify.toml` (add a headers block)
- Modify: `package.json` (root — add a `check:locales` script)

**Interfaces:**
- Produces: three locale files reachable at `/locales/{en,es,fr}.json`; an executable parity check `node scripts/check-locale-parity.mjs`.

- [ ] **Step 1: Seed the three locale files with the nav/footer keys**

`artifacts/memorial/public/locales/en.json`:
```json
{
  "nav.createPage": "Create a page",
  "nav.dashboard": "Dashboard",
  "nav.signOut": "Sign Out",
  "nav.signIn": "Sign In",
  "nav.home": "Home",
  "nav.tributes": "Tributes",
  "nav.reach": "Reach",
  "nav.manage": "Manage",
  "nav.leaveTribute": "Leave a Tribute",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "nav.language": "Language",
  "footer.inLovingMemory": "In loving memory."
}
```

`artifacts/memorial/public/locales/es.json`:
```json
{
  "nav.createPage": "Crear una página",
  "nav.dashboard": "Panel",
  "nav.signOut": "Cerrar sesión",
  "nav.signIn": "Iniciar sesión",
  "nav.home": "Inicio",
  "nav.tributes": "Homenajes",
  "nav.reach": "Alcance",
  "nav.manage": "Administrar",
  "nav.leaveTribute": "Dejar un homenaje",
  "nav.openMenu": "Abrir menú",
  "nav.closeMenu": "Cerrar menú",
  "nav.language": "Idioma",
  "footer.inLovingMemory": "En memoria amorosa."
}
```

`artifacts/memorial/public/locales/fr.json`:
```json
{
  "nav.createPage": "Créer une page",
  "nav.dashboard": "Tableau de bord",
  "nav.signOut": "Se déconnecter",
  "nav.signIn": "Se connecter",
  "nav.home": "Accueil",
  "nav.tributes": "Hommages",
  "nav.reach": "Portée",
  "nav.manage": "Gérer",
  "nav.leaveTribute": "Laisser un hommage",
  "nav.openMenu": "Ouvrir le menu",
  "nav.closeMenu": "Fermer le menu",
  "nav.language": "Langue",
  "footer.inLovingMemory": "En mémoire affectueuse."
}
```

- [ ] **Step 2: Write the parity check script**

`scripts/check-locale-parity.mjs`:
```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "memorial",
  "public",
  "locales",
);
const langs = ["en", "es", "fr"];
const load = (l) => JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8"));
const data = Object.fromEntries(langs.map((l) => [l, load(l)]));
const enKeys = Object.keys(data.en).sort();

let failed = false;
for (const l of langs.filter((x) => x !== "en")) {
  const present = new Set(Object.keys(data[l]));
  const missing = enKeys.filter((k) => !present.has(k));
  const extra = Object.keys(data[l]).filter((k) => !(k in data.en));
  if (missing.length) {
    failed = true;
    console.error(`[${l}] missing ${missing.length} key(s):`, missing);
  }
  if (extra.length) {
    failed = true;
    console.error(`[${l}] ${extra.length} extra key(s) not in en:`, extra);
  }
}
if (failed) {
  console.error("Locale parity check FAILED");
  process.exit(1);
}
console.log(`Locale parity OK — ${enKeys.length} keys across ${langs.join(", ")}`);
```

- [ ] **Step 3: Add the `no-store` header to netlify.toml**

In `netlify.toml`, add this block (place it before the redirects section):
```toml
# Translation files must never be cached, so edits take effect on the next reload.
[[headers]]
  for = "/locales/*"
  [headers.values]
    Cache-Control = "no-store, must-revalidate"
```

- [ ] **Step 4: Add the root convenience script**

In the root `package.json` `"scripts"` block, add:
```json
"check:locales": "node scripts/check-locale-parity.mjs"
```

- [ ] **Step 5: Run the parity check**

Run: `node scripts/check-locale-parity.mjs`
Expected: `Locale parity OK — 13 keys across en, es, fr`

- [ ] **Step 6: Commit**

```bash
git add artifacts/memorial/public/locales scripts/check-locale-parity.mjs netlify.toml package.json
git commit -m "feat(i18n): locale files + no-store delivery + parity check"
```

---

### Task 2: i18n core helpers

**Files:**
- Create: `artifacts/memorial/src/lib/i18n.ts`

**Interfaces:**
- Produces:
  - `type Lang = "en" | "es" | "fr"`
  - `const LANGS: Lang[]`, `const LANG_LABELS: Record<Lang, string>`, `const DEFAULT_LANG: Lang`, `const LANG_STORAGE_KEY: string`
  - `type Messages = Record<string, string>`
  - `function isLang(v: unknown): v is Lang`
  - `function fetchMessages(lang: Lang): Promise<Messages>`
  - `function translate(key: string, messages: Messages, fallback: Messages, lang: Lang, vars?: Record<string, string | number>): string`

- [ ] **Step 1: Write `src/lib/i18n.ts`**

```ts
export type Lang = "en" | "es" | "fr";

export const LANGS: Lang[] = ["en", "es", "fr"];
export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};
export const DEFAULT_LANG: Lang = "en";
export const LANG_STORAGE_KEY = "bf_lang";

export type Messages = Record<string, string>;

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

// Fetch a locale file with no HTTP caching so edits take effect on reload.
export async function fetchMessages(lang: Lang): Promise<Messages> {
  const res = await fetch(`/locales/${lang}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load locale "${lang}": ${res.status}`);
  return (await res.json()) as Messages;
}

// Replace {name} tokens from vars; leave unknown tokens intact.
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

// Resolve a key against active messages, then English fallback, then the key itself.
// When `vars.count` is a number, prefer the CLDR plural variant `key_<category>`
// (e.g. key_one / key_other) selected by Intl.PluralRules for the active language.
// "#" inside the chosen template is replaced with the count, and {tokens} are interpolated.
export function translate(
  key: string,
  messages: Messages,
  fallback: Messages,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  let lookupKey = key;
  if (vars && typeof vars.count === "number") {
    const category = new Intl.PluralRules(lang).select(vars.count);
    const candidate = `${key}_${category}`;
    if (candidate in messages || candidate in fallback) {
      lookupKey = candidate;
    } else if (`${key}_other` in messages || `${key}_other` in fallback) {
      lookupKey = `${key}_other`;
    }
  }
  const template = messages[lookupKey] ?? fallback[lookupKey] ?? key;
  const withCount =
    vars && typeof vars.count === "number"
      ? template.replace(/#/g, String(vars.count))
      : template;
  return interpolate(withCount, vars);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: passes (no errors).

- [ ] **Step 3: Commit**

```bash
git add artifacts/memorial/src/lib/i18n.ts
git commit -m "feat(i18n): core translate/fetch/plural helpers"
```

---

### Task 3: LanguageProvider + useT hook + mount in App

**Files:**
- Create: `artifacts/memorial/src/components/language-provider.tsx`
- Modify: `artifacts/memorial/src/App.tsx`

**Interfaces:**
- Consumes: everything from `src/lib/i18n.ts` (Task 2); `PLATFORM_SEGMENTS` from `@/lib/tenant`; `useGetTenant` from `@workspace/api-client-react`.
- Produces:
  - `function LanguageProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useT(): { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string; ready: boolean }`

- [ ] **Step 1: Write `src/components/language-provider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetTenant } from "@workspace/api-client-react";
import { PLATFORM_SEGMENTS } from "@/lib/tenant";
import {
  type Lang,
  type Messages,
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  fetchMessages,
  isLang,
  translate,
} from "@/lib/i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

// Mirror layout's slug detection: first path segment, unless it's a platform route.
function useCurrentSlug(): string | undefined {
  const [location] = useLocation();
  const first = location.split("/")[1] ?? "";
  if (PLATFORM_SEGMENTS.has(first)) return undefined;
  return first || undefined;
}

// Minimal, text-free loader (text would itself need translating).
function I18nLoader() {
  return <div className="min-h-[100dvh] bg-background" aria-hidden />;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const slug = useCurrentSlug();
  // Disabled when slug is "" (the hook has enabled: !!slug built in).
  const { data: tenant, isLoading: tenantLoading } = useGetTenant(slug ?? "");

  const explicit = storedLang();
  const tenantDefault: Lang | null = (() => {
    const cfg = tenant?.pageConfig as Record<string, unknown> | undefined;
    return isLang(cfg?.defaultLanguage) ? (cfg!.defaultLanguage as Lang) : null;
  })();

  // On a tenant route with no explicit choice, wait for the tenant query before
  // committing a language, so first paint isn't an en→default flip.
  const waitingForTenant = !explicit && slug !== undefined && tenantLoading;
  const effective: Lang = explicit ?? tenantDefault ?? DEFAULT_LANG;

  const [lang, setLangState] = useState<Lang>(explicit ?? DEFAULT_LANG);
  const [messages, setMessages] = useState<Messages>({});
  const [fallback, setFallback] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  // Track the resolved language until the user makes an explicit choice.
  useEffect(() => {
    if (explicit) {
      if (explicit !== lang) setLangState(explicit);
      return;
    }
    if (waitingForTenant) return;
    if (effective !== lang) setLangState(effective);
  }, [explicit, effective, waitingForTenant, lang]);

  // Load the English fallback once.
  useEffect(() => {
    fetchMessages("en")
      .then(setFallback)
      .catch(() => setFallback({}));
  }, []);

  // Load the active language whenever it changes (no-store, so reloads pick up edits).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    fetchMessages(lang)
      .then((m) => {
        if (!cancelled) {
          setMessages(m);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages({});
          setReady(true);
        }
      });
    document.documentElement.lang = lang;
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      /* ignore storage failures */
    }
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(key, messages, fallback, lang, vars),
    [messages, fallback, lang],
  );

  const showLoader = !ready || waitingForTenant;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, ready }}>
      {showLoader ? <I18nLoader /> : children}
    </LanguageContext.Provider>
  );
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}
```

- [ ] **Step 2: Mount the provider in `App.tsx`**

Add the import near the other `@/components` imports:
```tsx
import { LanguageProvider } from "@/components/language-provider";
```

Wrap `<Router />` inside the existing `<WouterRouter>` (replace the current `<WouterRouter>...</WouterRouter>` body):
```tsx
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LanguageProvider>
            <Router />
          </LanguageProvider>
        </WouterRouter>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add artifacts/memorial/src/components/language-provider.tsx artifacts/memorial/src/App.tsx
git commit -m "feat(i18n): LanguageProvider + useT hook, mounted in router"
```

---

### Task 4: Language switcher + migrate layout.tsx (canonical migration example)

This task introduces the **Migration Procedure** that Tasks 6–12 reuse, fully worked on `layout.tsx`.

**Files:**
- Create: `artifacts/memorial/src/components/language-switcher.tsx`
- Modify: `artifacts/memorial/src/components/layout.tsx`
- (locale keys for layout already seeded in Task 1)

**Interfaces:**
- Consumes: `useT` (Task 3); `LANGS`, `LANG_LABELS`, `Lang` (Task 2).
- Produces: `function LanguageSwitcher({ className }: { className?: string }): JSX.Element`.

#### Migration Procedure (referenced by later tasks)

1. Add `const { t } = useT();` at the top of the component body (import: `import { useT } from "@/components/language-provider";`).
2. Replace every **hardcoded UI literal** with `t("namespace.key")`. Use the file's namespace (e.g. `landing.`, `compose.`, `wall.`). Key names are `camelCase`, descriptive of meaning not location.
3. Translate **text in attributes** too: `aria-label`, `placeholder`, `alt`, `title`.
4. For dynamic values use interpolation: `t("compose.greeting", { name })` with `"compose.greeting": "Hi, {name}"`.
5. For counts use plural keys: `t("wall.count", { count })` with `"wall.count_one": "# tribute"` and `"wall.count_other": "# tributes"` (add `_one`/`_other` for all three languages; French treats 0 and 1 as singular — `Intl.PluralRules` handles this).
6. Add every new key to **all three** locale files with real `es`/`fr` translations.
7. **Do NOT translate:** values that come from data — `tenant.friendName`, `pageConfig` strings, user/tribute/card content, slugs, emails, URLs.
8. After the file: `pnpm run typecheck`, then `node scripts/check-locale-parity.mjs`, then a manual browser check.

- [ ] **Step 1: Write `src/components/language-switcher.tsx`**

```tsx
import { Globe } from "lucide-react";
import { useT } from "@/components/language-provider";
import { LANGS, LANG_LABELS, type Lang } from "@/lib/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <label className={`inline-flex items-center gap-1.5 text-muted-foreground ${className ?? ""}`}>
      <Globe size={16} aria-hidden />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        className="bg-transparent text-sm focus:outline-none cursor-pointer"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Migrate `layout.tsx` strings and add the switcher**

At the top of `layout.tsx` add imports:
```tsx
import { useT } from "@/components/language-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
```
Inside `Layout`, add `const { t } = useT();` near the other hooks.

Replace the hardcoded nav/footer literals with `t(...)` using the keys seeded in Task 1. Exact replacements:
- `Create a page` → `{t("nav.createPage")}` (desktop + mobile)
- `Dashboard` → `{t("nav.dashboard")}` (desktop + mobile)
- `Sign Out` → `{t("nav.signOut")}` (desktop + mobile)
- `Sign In` → `{t("nav.signIn")}` (desktop + mobile)
- `Home` → `{t("nav.home")}` (desktop + mobile)
- `Tributes` → `{t("nav.tributes")}` (desktop + mobile)
- `Reach` → `{t("nav.reach")}` (desktop + mobile)
- `Manage` → `{t("nav.manage")}` (desktop + mobile)
- `Leave a Tribute` → `{t("nav.leaveTribute")}` (desktop + mobile)
- `aria-label={menuOpen ? "Close menu" : "Open menu"}` → `aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}`
- footer `In loving memory.` → `{t("footer.inLovingMemory")}`

Add the switcher to the **desktop** nav — inside both the platform and tenant `<nav className="hidden md:flex ...">` branches, as the last child:
```tsx
<LanguageSwitcher />
```
Add it to the **mobile** panel — at the end of each `<nav className="container ...">` block, after the last button:
```tsx
<div className="pt-3 border-t border-border/40 mt-2">
  <LanguageSwitcher />
</div>
```
(Do **not** translate `brandName` — it is `tenant.friendName` / slug, owner data.)

- [ ] **Step 3: Typecheck + parity**

Run: `pnpm run typecheck` → passes.
Run: `node scripts/check-locale-parity.mjs` → `Locale parity OK`.

- [ ] **Step 4: Manual verification**

Run the dev server (`pnpm --filter @workspace/api-server run dev` and `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/memorial run dev`). In the browser:
- Switch language via the header dropdown → nav labels change to ES/FR immediately; reload → choice persists; `<html lang>` updates (check devtools Elements).
- Visit a tenant page → nav is present; brand name (friend name) stays unchanged.

- [ ] **Step 5: Commit**

```bash
git add artifacts/memorial/src/components/language-switcher.tsx artifacts/memorial/src/components/layout.tsx
git commit -m "feat(i18n): language switcher + translated layout nav/footer"
```

---

### Task 5: Per-tenant default language in /manage

**Files:**
- Modify: `artifacts/memorial/src/pages/manage.tsx` (`PageSettingsState` ~L43-64; `buildPageConfig` ~L73-106; `buildDefaultSettings` ~L108+; the Theme settings block ~L836-861)
- Modify: the three locale files (add the manage default-language keys)

**Interfaces:**
- Consumes: `Lang`, `isLang` from `@/lib/i18n`.
- Produces: `pageConfig.defaultLanguage` persisted via the existing `useUpdateTenant` save flow.

- [ ] **Step 1: Import the i18n types in manage.tsx**

Add near the top imports:
```tsx
import { type Lang, isLang } from "@/lib/i18n";
```

- [ ] **Step 2: Add the field to `PageSettingsState`**

In the interface (after `font`):
```tsx
  // locale
  defaultLanguage: Lang;
```

- [ ] **Step 3: Persist it in `buildPageConfig`**

Add to the returned object (top level, alongside `theme`/`hero`):
```tsx
    defaultLanguage: settings.defaultLanguage,
```

- [ ] **Step 4: Read it in `buildDefaultSettings`**

Where the returned `PageSettingsState` object is assembled, add:
```tsx
    defaultLanguage: isLang(cfg.defaultLanguage) ? cfg.defaultLanguage : "en",
```

- [ ] **Step 5: Add the selector to the Theme settings grid**

Inside the `grid grid-cols-2 gap-3` Theme block (after the Palette `<div>`, ~L860), add:
```tsx
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t("manage.defaultLanguage")}</label>
                  <select
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.defaultLanguage}
                    onChange={(e) =>
                      setPageSettings((prev) =>
                        prev ? { ...prev, defaultLanguage: e.target.value as Lang } : prev,
                      )
                    }
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
```
(`manage.tsx` must have `const { t } = useT();` in scope — add it with the `useT` import if not already present from a later task; if migrating manage strings happens in Task 11, add the import+hook here now so this label works.)

- [ ] **Step 6: Add the locale keys**

Add to `en.json`: `"manage.defaultLanguage": "Default language"`.
Add to `es.json`: `"manage.defaultLanguage": "Idioma predeterminado"`.
Add to `fr.json`: `"manage.defaultLanguage": "Langue par défaut"`.

- [ ] **Step 7: Typecheck + parity**

Run: `pnpm run typecheck` → passes (confirms `TenantUpdatePageConfig` accepts the extra field; if it errors as a closed type, the field is still valid jsonb — cast the return of `buildPageConfig` is NOT needed because the type is `record(string, unknown)`).
Run: `node scripts/check-locale-parity.mjs` → OK.

- [ ] **Step 8: Manual verification**

In `/`<slug>`/manage`, open Page settings → set Default language to Español → Save. Open the page in a fresh browser/incognito (no `bf_lang` set) → it loads in Spanish. Set it back; confirm a visitor who has explicitly chosen a language is **not** overridden.

- [ ] **Step 9: Commit**

```bash
git add artifacts/memorial/src/pages/manage.tsx artifacts/memorial/public/locales
git commit -m "feat(i18n): owner-set per-tenant default language in /manage"
```

---

### Tasks 6–12: String migration (apply the Migration Procedure from Task 4)

Each task migrates the named file(s): add `useT`, replace every UI literal with `t("<namespace>.<key>")`, add keys to all three locale files with real ES/FR translations, then run `pnpm run typecheck` + `node scripts/check-locale-parity.mjs` + a manual check, then commit. **Read each file first and extract every visible literal** — the namespaces below are fixed; the key set is discovered per file. Skip data-derived strings (friendName, pageConfig values, user/tribute/card content).

- [ ] **Task 6 — `landing.tsx` + `home.tsx`** (namespaces `landing.`, `home.`)
  Known landing literals to key: the three step cards (`"Create a page"` → reuse `nav.createPage` or new `landing.step1Title`; bodies → `landing.step1Body`, `landing.step2*`, `landing.step3*`), hero heading/subcopy, and any CTA buttons. Commit: `feat(i18n): translate landing + home`.

- [ ] **Task 7 — `sign-in.tsx` + `create.tsx`** (namespaces `signin.`, `create.`)
  Form labels, placeholders, helper text, submit buttons, success/error copy. Commit: `feat(i18n): translate sign-in + create`.

- [ ] **Task 8 — `compose.tsx`** (namespace `compose.`)
  Recorder/card UI, prompts, buttons, validation/toast strings. Commit: `feat(i18n): translate compose`.

- [ ] **Task 9 — `wall.tsx` + `tribute.tsx`** (namespaces `wall.`, `tribute.`)
  Headings, empty states, the tribute **count** (use plural keys `wall.count_one`/`wall.count_other`), edit/delete controls, confirm dialogs. Commit: `feat(i18n): translate wall + tribute`.

- [ ] **Task 10 — `map.tsx` + `dashboard.tsx`** (namespaces `map.`, `dashboard.`)
  Map controls (Connect button, pin prompts, instructions), dashboard headings/empty states/labels. Commit: `feat(i18n): translate map + dashboard`.

- [ ] **Task 11 — `manage.tsx`** (namespace `manage.`)
  All remaining owner-facing UI labels, section headings, buttons, confirm prompts (e.g. the unsaved-changes `confirm(...)`), save/delete states. (The `manage.defaultLanguage` key from Task 5 already exists.) Commit: `feat(i18n): translate manage`.

- [ ] **Task 12 — presentation scenes** (`components/presentation/{title-scene,journey-scene,memory-scene,presentation-controls}.tsx`, namespace `present.`)
  Control labels (play/pause/next/exit/fullscreen), any chrome captions. Do not translate the memory/tribute content itself. Commit: `feat(i18n): translate presentation chrome`.

---

### Task 13: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm run typecheck`
Expected: passes across the workspace.

- [ ] **Step 2: Locale parity**

Run: `node scripts/check-locale-parity.mjs`
Expected: `Locale parity OK — N keys across en, es, fr`.

- [ ] **Step 3: Untranslated-literal sweep**

Run a grep for obvious leftover English JSX literals in migrated files, e.g.:
```bash
grep -rnE ">[A-Z][a-z]+ [A-Za-z ]+<" artifacts/memorial/src/pages artifacts/memorial/src/components/layout.tsx
```
Review hits: each should be either a `t(...)` call result, data-derived (friendName/pageConfig/user content), or intentionally not chrome. Fix any missed chrome.

- [ ] **Step 4: Manual end-to-end check**

With dev servers running: for each of EN/ES/FR via the switcher, walk landing → a tenant home → wall → compose → map → manage, confirming chrome is translated and user/owner content is untouched. Confirm: switching persists across reload; a tenant default applies for a no-choice visitor; editing `public/locales/es.json` and reloading shows the change with **no rebuild** (no-store working).

- [ ] **Step 5: Final commit (if any sweep fixes)**

```bash
git add -A
git commit -m "fix(i18n): final translation sweep"
```

---

## Self-Review

**Spec coverage:**
- Locale files in `public/locales/*.json` → Task 1. ✓
- No-store delivery (netlify header + `cache: "no-store"`) → Task 1 (header) + Task 2 (`fetchMessages`). ✓
- Tiny custom mechanism, no deps → Tasks 2–3. ✓
- Provider + `useT`, fallback to English, gated first paint → Task 3. ✓
- Resolution precedence (explicit > tenant default > en) → Task 3. ✓
- Per-tenant default in `pageConfig` + `/manage` selector, no codegen → Task 5 (verified: `additionalProperties: true` / `record(string, unknown)`). ✓
- Switcher in desktop + mobile nav → Task 4. ✓
- String migration across all named files → Tasks 4, 6–12. ✓
- Parity check + typecheck gate (no test runner) → Task 1 + every task. ✓
- Out-of-scope content untouched → Migration Procedure step 7 + Task 13 sweep. ✓

**Placeholder scan:** Migration Tasks 6–12 are procedure-driven (key sets discovered per file) rather than enumerating literals from files not yet read — the procedure and the canonical worked example (Task 4) are complete; this is intentional, not a placeholder. All code-bearing infrastructure steps (Tasks 1–5) contain full code.

**Type consistency:** `Lang`, `Messages`, `isLang`, `fetchMessages`, `translate` defined in Task 2 are used with identical signatures in Tasks 3, 5, and the switcher. `useT()` return shape (`{ lang, setLang, t, ready }`) defined in Task 3 matches all consumers. `LANG_STORAGE_KEY = "bf_lang"` matches the spec's `localStorage["bf_lang"]`. Plural key convention `key_one`/`key_other` is consistent between Task 2's `translate` and the Migration Procedure.
