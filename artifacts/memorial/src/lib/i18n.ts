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
