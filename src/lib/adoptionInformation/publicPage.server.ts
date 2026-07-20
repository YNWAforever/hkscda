import { loadPublishedDocumentSlots } from "../documents/public.server";
import type { DocumentSlot } from "../documents/types";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAdoptionInformationRepository } from "./repository.server";
import type { AdoptionInformationRepository } from "./service";
import type { AdoptionFee, DogFriendlyEstate } from "./types";

export const POST_ADOPTION_GUIDE_SLOT_KEY = "post_adoption_guide";

export type PublicAdoptionPageData = {
  feesBySpecies: { dog: AdoptionFee[]; cat: AdoptionFee[] };
  estates: DogFriendlyEstate[];
  guides: DocumentSlot[];
};

type PublicRepository = Pick<AdoptionInformationRepository, "listPublic">;
type GuideLoader = (slotKeys: string[]) => Promise<DocumentSlot[]>;

export function createPublicAdoptionPageReader({
  adoptionRepository,
  loadGuides,
}: {
  adoptionRepository: PublicRepository;
  loadGuides: GuideLoader;
}) {
  return async (): Promise<PublicAdoptionPageData> => {
    const [information, slots] = await Promise.all([
      adoptionRepository.listPublic(),
      loadGuides([POST_ADOPTION_GUIDE_SLOT_KEY]),
    ]);
    const fees = information.fees
      .filter((fee) => fee.isPublished)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const guides = slots
      .filter(
        (slot) =>
          slot.slotKey === POST_ADOPTION_GUIDE_SLOT_KEY &&
          slot.isPublished &&
          slot.document.isPublished &&
          Boolean(slot.document.fileUrl),
      )
      .sort((left, right) => (left.language === "zh-HK" ? -1 : right.language === "zh-HK" ? 1 : 0));

    return {
      feesBySpecies: {
        dog: fees.filter((fee) => fee.animalType === "dog"),
        cat: fees.filter((fee) => fee.animalType === "cat"),
      },
      estates: information.estates
        .filter((estate) => estate.isPublished)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.estateName.localeCompare(right.estateName, "zh-HK"),
        ),
      guides,
    };
  };
}

export async function loadPublicAdoptionPage() {
  try {
    const client = createSupabaseServiceClient();
    return await createPublicAdoptionPageReader({
      adoptionRepository: createSupabaseAdoptionInformationRepository(client),
      loadGuides: (slotKeys) => loadPublishedDocumentSlots(slotKeys),
    })();
  } catch {
    throw new Error("Could not load adoption information");
  }
}
