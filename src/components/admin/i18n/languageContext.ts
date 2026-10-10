import { createContext, useContext } from "react";
import type { AdminLanguage } from "../../../lib/admin/language";
import type { AdminCopy } from "./adminCommonCopy";

export interface AdminLanguageContextValue {
  copy: AdminCopy;
  language: AdminLanguage;
  setLanguage: (language: AdminLanguage) => void;
}

/**
 * The context behind `AdminLanguageProvider`. It lives here, apart from the provider's
 * component file, so the provider file keeps to components and hooks that fast refresh can
 * handle; `useAdminLanguage` is still read from `adminI18n`.
 */
export const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null);

/**
 * The active language, or Chinese when there is no provider. Only for the shared
 * building blocks that also render on their own; see `useSharedAdminCopy`.
 */
export function useAdminLanguageOrDefault(): AdminLanguage {
  return useContext(AdminLanguageContext)?.language ?? "zh";
}
