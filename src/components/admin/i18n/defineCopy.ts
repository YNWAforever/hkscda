/**
 * The typed shape of a bilingual copy module. This file has no React or provider
 * imports on purpose: `adminCommonCopy.ts` is read by `adminI18n.tsx`, and `copy.ts`
 * reads `adminI18n.tsx`, so the definition has to sit below both. Import it from
 * `./copy` everywhere else.
 */
export type AdminCopyModule<T> = { readonly zh: T; readonly en: T };

/**
 * Declares a copy module. `en` is checked against the type taken from `zh`, which is
 * the source of truth, so `tsc` rejects a key that is missing from either language, a
 * key that only one language has, and a value of a different type or signature.
 */
export function defineAdminCopy<T>(copy: { zh: T; en: NoInfer<T> }): AdminCopyModule<T> {
  return copy;
}
