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
