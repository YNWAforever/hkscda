import { loadPublishedDocumentSlots } from "../documents/public.server";
import type { DocumentSlot } from "../documents/types";

export const SPONSORSHIP_TERMS_SLOT_KEY = "sponsorship_terms";
export type SponsorshipTerms = {
  version: string;
  title: string;
  documentUrl: string;
  documentDate: string;
};

export function selectPublishedSponsorshipTerms(
  slots: DocumentSlot[],
  language: "zh-HK" | "en",
): SponsorshipTerms | null {
  const slot = slots.find(
    (entry) =>
      entry.slotKey === SPONSORSHIP_TERMS_SLOT_KEY &&
      entry.language === language &&
      entry.isPublished &&
      entry.document.kind === "sponsorship_terms" &&
      entry.document.isPublished &&
      entry.document.fileUrl &&
      /^[a-f0-9]{64}$/.test(entry.document.checksumSha256 ?? ""),
  );
  if (!slot || !slot.document.fileUrl) return null;
  return {
    version: slot.document.checksumSha256!,
    title: slot.document.title,
    documentUrl: slot.document.fileUrl,
    documentDate: slot.document.updatedAt,
  };
}

export async function loadCurrentSponsorshipTerms(language: "zh-HK" | "en") {
  const slots = await loadPublishedDocumentSlots([SPONSORSHIP_TERMS_SLOT_KEY]);
  return selectPublishedSponsorshipTerms(slots, language);
}
