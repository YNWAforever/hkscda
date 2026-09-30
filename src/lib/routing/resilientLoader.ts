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
export type PublicLoaderResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; referenceId: string };

export function resilientPublicLoader<T>(
  load: () => Promise<T> | T,
  deps: { createReferenceId?: () => string } = {},
): () => Promise<PublicLoaderResult<T>> {
  return async () => {
    try {
      return { status: "ok", data: await load() };
    } catch (error) {
      // Keep provider messages private. The reference lets support find this safe log.
      let code = "UNKNOWN";
      let current: unknown = error;
      for (let depth = 0; depth < 3; depth++) {
        if (typeof current !== "object" || current === null) break;
        const candidate = (current as { code?: unknown }).code;
        if (typeof candidate === "string" && /^[A-Z0-9_]{2,16}$/.test(candidate)) {
          code = candidate;
          break;
        }
        current = (current as { cause?: unknown }).cause;
      }
      const referenceId = deps.createReferenceId?.() ?? globalThis.crypto.randomUUID();
      console.error("Public loader failed; rendering the unavailable state.", {
        code,
        referenceId,
      });
      return { status: "error", referenceId };
    }
  };
}
