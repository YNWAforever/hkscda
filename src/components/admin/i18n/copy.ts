import { useAdminLanguage } from "../adminI18n";
import type { AdminLanguage } from "../../../lib/admin/language";
import type { AdminCopyModule } from "./defineCopy";

export { defineAdminCopy } from "./defineCopy";
export type { AdminCopyModule } from "./defineCopy";
export type { AdminLanguage } from "../../../lib/admin/language";

/**
 * The active language's half of a copy module. Must be called inside
 * `AdminLanguageProvider`, like `useAdminLanguage`.
 */
export function useAdminCopy<T>(copy: AdminCopyModule<T>): T {
  const { language } = useAdminLanguage();
  return copy[language];
}

/** The same lookup for code that has the language but is not a React component. */
export function pickAdminCopy<T>(copy: AdminCopyModule<T>, language: AdminLanguage): T {
  return copy[language];
}
