"use client";
import { Button } from "@/components/ui/button";
import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import {
  defaultLocale,
  dictionaries,
  intlLocale,
  localeCookie,
  type Locale,
} from "./dictionaries";

const LocaleContext = createContext<Locale>(defaultLocale);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return { t: dictionaries[locale], locale, intl: intlLocale(locale) };
}

export function LanguageSwitch() {
  const router = useRouter();
  const { t, locale } = useT();
  return (
    <Button
      variant="ghost"
      size="plain"
      type="button"
      className="language-switch"
      aria-label={t.language.switchLabel}
      lang={locale === "ar" ? "en" : "ar"}
      onClick={() => {
        const next: Locale = locale === "ar" ? "en" : "ar";
        document.cookie = `${localeCookie}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <Languages size={14} />
      <span className="full">{t.language.switchTo}</span>
      <span className="short">{t.language.short}</span>
    </Button>
  );
}
