import { loadPublishedDocumentSlots } from "./public.server";
import type { DocumentSlot } from "./types";

type DonationDocumentLoader = (slotKeys: string[]) => Promise<DocumentSlot[]>;

export async function loadDonationDocumentSlots(
  loader: DonationDocumentLoader = loadPublishedDocumentSlots,
) {
  try {
    return await loader(["wedding_gift_return_plan"]);
  } catch {
    return [];
  }
}
