import type { PublicAdoptionPageData } from "./publicPage.server";

type AdoptionInstructionsLoader = () => Promise<PublicAdoptionPageData>;

export function createAdoptionInstructionsLoader(load: AdoptionInstructionsLoader) {
  return () => load();
}
