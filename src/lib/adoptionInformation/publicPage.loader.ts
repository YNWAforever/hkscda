import type { PublicAdoptionPageData } from "./publicPage.server";
import type { PublicLoaderResult } from "../routing/resilientLoader";

type AdoptionInstructionsLoader = () => Promise<PublicLoaderResult<PublicAdoptionPageData>>;
export type AdoptionInstructionsResult =
  | PublicLoaderResult<PublicAdoptionPageData>
  | { status: "error"; referenceId: null };

export function createAdoptionInstructionsLoader(load: AdoptionInstructionsLoader) {
  return async (): Promise<AdoptionInstructionsResult> => {
    try {
      return await load();
    } catch {
      // A transport failure may never reach the server; do not invent a server log reference.
      return { status: "error", referenceId: null };
    }
  };
}
