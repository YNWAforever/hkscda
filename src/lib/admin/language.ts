/**
 * The two languages the admin back office is shown in. Kept in `src/lib` so that label
 * and message modules there can take a language without importing from
 * `src/components`. The provider, the toggle and the copy helpers re-export it.
 */
export type AdminLanguage = "zh" | "en";
