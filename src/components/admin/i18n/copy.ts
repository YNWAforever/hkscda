import { useAdminLanguage } from "../adminI18n";
import { useAdminLanguageOrDefault } from "./languageContext";
import type { AdminLanguage } from "../../../lib/admin/language";
import type { AdminCopyModule } from "./copyModule";

export { defineAdminCopy } from "./copyModule";
export type { AdminCopyModule } from "./copyModule";
export type { AdminLanguage } from "../../../lib/admin/language";

/**
 * The active language's half of a copy module. Must be called inside
 * `AdminLanguageProvider`, like `useAdminLanguage`.
 */
export function useAdminCopy<T>(copy: AdminCopyModule<T>): T {
  const { language } = useAdminLanguage();
  return copy[language];
}

/**
 * Like `useAdminCopy`, but shows Chinese outside `AdminLanguageProvider` instead of
 * throwing. For the shared building blocks that also render on their own (data tables,
 * pagers, failure states, bulk panels), so a parent's test does not need a provider just
 * for them. Screens use `useAdminCopy`, which fails loudly when the provider is missing.
 */
export function useSharedAdminCopy<T>(copy: AdminCopyModule<T>): T {
  return copy[useAdminLanguageOrDefault()];
}

/** The same lookup for code that has the language but is not a React component. */
export function pickAdminCopy<T>(copy: AdminCopyModule<T>, language: AdminLanguage): T {
  return copy[language];
}
