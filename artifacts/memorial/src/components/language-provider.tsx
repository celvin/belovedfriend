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
