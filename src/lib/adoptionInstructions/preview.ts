import type { PublicAdoptionPageData } from "../adoptionInformation/publicPage.server";
import type { AdoptionInstructionRevision } from "./types";
import { adoptionInstructionContentSchema } from "./schemas";
export async function loadAdoptionInstructionPreview(
  loadPage: () => Promise<PublicAdoptionPageData>,
  loadDraft: () => Promise<AdoptionInstructionRevision>,
): Promise<PublicAdoptionPageData> {
  const [page, draft] = await Promise.all([loadPage(), loadDraft()]);
  if (draft.state !== "draft") throw new Error("No draft available");
  return { ...page, copy: adoptionInstructionContentSchema.parse(draft.content) };
}
