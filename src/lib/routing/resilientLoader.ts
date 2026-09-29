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
      // Database messages can contain private content. Log only a safe error code.
      const candidate =
        error instanceof Error || (typeof error === "object" && error !== null)
          ? (error as { code?: unknown }).code
          : undefined;
      const code =
        typeof candidate === "string" && /^[A-Z0-9_]{2,16}$/.test(candidate)
          ? candidate
          : "UNKNOWN";
      console.error("Public loader failed; rendering the unavailable state.", { code });
      return { status: "error" };
    }
  };
}
