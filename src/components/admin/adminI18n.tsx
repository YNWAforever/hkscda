import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminLanguage } from "../../lib/admin/language";
import { adminCommonCopy, type AdminCopy } from "./i18n/adminCommonCopy";
import { AdminLanguageContext } from "./i18n/languageContext";
import { setAdminDocumentLanguage } from "./i18n/pageLanguage";

export type { AdminLanguage } from "../../lib/admin/language";

const STORAGE_KEY = "hkscda-admin-language";

/** The shared copy in both languages. The copy for each area lives in its own module. */
export const adminCopy: Record<AdminLanguage, AdminCopy> = adminCommonCopy;

function isAdminLanguage(value: string | null): value is AdminLanguage {
  return value === "zh" || value === "en";
}

function AdminLanguageRoot({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: AdminLanguage;
}) {
  const [language, setLanguageState] = useState<AdminLanguage>(initialLanguage ?? "zh");

  useEffect(() => {
    if (initialLanguage) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isAdminLanguage(stored)) setLanguageState(stored);
  }, [initialLanguage]);

  useEffect(() => setAdminDocumentLanguage(document.documentElement, language), [language]);

  const setLanguage = (nextLanguage: AdminLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const value = useMemo(() => ({ copy: adminCopy[language], language, setLanguage }), [language]);

  return <AdminLanguageContext.Provider value={value}>{children}</AdminLanguageContext.Provider>;
}

/**
 * `initialLanguage` fixes the starting language and skips the stored preference. Tests
 * use it to render a screen in either language. Without it, the language starts as `zh`,
 * the same on the server and on first paint, and the stored choice is read in an effect.
 *
 * While it is mounted, the provider also sets `lang` on the `<html>` element, so portaled
 * content (the mobile menu, dialogs) is announced in the right language.
 *
 * A provider inside another provider does nothing: its children share the outer
 * language. Every admin page mounts its own provider, and this lets a test put one
 * provider around a whole page (`renderAdminInEnglish(<AdminLayout />)`) to choose the
 * language. In the running app nothing is nested, so this has no effect there.
 */
export function AdminLanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: AdminLanguage;
}) {
  const outer = useContext(AdminLanguageContext);
  if (outer) return <>{children}</>;
  return <AdminLanguageRoot initialLanguage={initialLanguage}>{children}</AdminLanguageRoot>;
}

export function useAdminLanguage() {
  const context = useContext(AdminLanguageContext);
  if (!context) throw new Error("useAdminLanguage must be used within AdminLanguageProvider");
  return context;
}

export function AdminLanguageToggle() {
  const { copy, language, setLanguage } = useAdminLanguage();

  return (
    <div
      className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs shadow-sm"
      aria-label="Admin language"
    >
      {(["zh", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLanguage(option)}
          className={`min-h-9 rounded-md px-3 font-medium transition-colors ${
            language === option
              ? "bg-[var(--color-panel)] text-white"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]"
          }`}
          aria-pressed={language === option}
        >
          {option === "zh" ? copy.common.chinese : copy.common.english}
        </button>
      ))}
    </div>
  );
}
