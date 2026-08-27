/**
 * Defect G-17. Public route loaders that await Supabase threw when it was
 * unreachable, and a throwing loader makes the whole document a 500: no header,
 * no logo, no heading, nothing the visitor can act on. That is a production
 * outage behaviour, not only a CI inconvenience.
 *
 * Wrapping a loader here turns the failure into data. The route still renders its
 * shell and shows a retry panel, and the response stays 200.
 *
 * The loader keeps its own name and inputs; only the return shape gains the
 * wrapper, so the contract rule in the plan holds.
 */
export type PublicLoaderResult<T> = { status: "ok"; data: T } | { status: "error" };

export function resilientPublicLoader<T>(
  load: () => Promise<T> | T,
): () => Promise<PublicLoaderResult<T>> {
  return async () => {
    try {
      return { status: "ok", data: await load() };
    } catch (error) {
      // Logged rather than swallowed: the page degrades, but the cause still has
      // to reach the server logs.
      console.error("Public loader failed; rendering the unavailable state.", error);
      return { status: "error" };
    }
  };
}
