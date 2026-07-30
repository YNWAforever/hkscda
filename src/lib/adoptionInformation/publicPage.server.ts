import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPublicDocumentRepository,
  loadPublishedDocumentSlots,
} from "../documents/public.server";
import type { DocumentSlot } from "../documents/types";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseAdoptionInformationRepository } from "./repository.server";
import type { AdoptionInformationRepository } from "./service";
import type { AdoptionFee, DogFriendlyEstate } from "./types";

export const POST_ADOPTION_GUIDE_SLOT_KEY = "post_adoption_guide";
export const POST_ADOPTION_GUIDE_SLOT_KEYS = [
  "post_adoption_guide_cat",
  "post_adoption_guide_dog",
  "post_adoption_guide_general",
  POST_ADOPTION_GUIDE_SLOT_KEY,
] as const;

const postAdoptionGuideSpecies = [
  { species: "cat", slotKey: "post_adoption_guide_cat" },
  { species: "dog", slotKey: "post_adoption_guide_dog" },
  { species: "general", slotKey: "post_adoption_guide_general" },
] as const;

export type PublicAdoptionGuideGroup = {
  species: "cat" | "dog" | "general";
  zhHk: DocumentSlot;
  en: DocumentSlot;
};

export type PublicAdoptionPageData = {
  feesBySpecies: { dog: AdoptionFee[]; cat: AdoptionFee[] };
  estates: DogFriendlyEstate[];
  guideGroups: PublicAdoptionGuideGroup[];
};

type PublicRepository = Pick<AdoptionInformationRepository, "listPublic">;
type GuideLoader = (slotKeys: string[]) => Promise<DocumentSlot[]>;

function completeGuideGroup(
  slots: DocumentSlot[],
  species: PublicAdoptionGuideGroup["species"],
  slotKey: string,
): PublicAdoptionGuideGroup | null {
  const zhHk = slots.find((slot) => slot.slotKey === slotKey && slot.language === "zh-HK");
  const en = slots.find((slot) => slot.slotKey === slotKey && slot.language === "en");

  return zhHk && en ? { species, zhHk, en } : null;
}

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
      loadGuides([...POST_ADOPTION_GUIDE_SLOT_KEYS]),
    ]);
    const fees = information.fees
      .filter((fee) => fee.isPublished)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const publishedGuides = slots.filter(
      (slot) =>
        POST_ADOPTION_GUIDE_SLOT_KEYS.includes(
          slot.slotKey as (typeof POST_ADOPTION_GUIDE_SLOT_KEYS)[number],
        ) &&
        slot.isPublished &&
        slot.document.isPublished &&
        Boolean(slot.document.fileUrl),
    );
    const guideGroups = postAdoptionGuideSpecies
      .map(({ species, slotKey }) => completeGuideGroup(publishedGuides, species, slotKey))
      .filter((group): group is PublicAdoptionGuideGroup => group !== null);
    const legacyGuideGroup = completeGuideGroup(
      publishedGuides,
      "general",
      POST_ADOPTION_GUIDE_SLOT_KEY,
    );

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
      guideGroups: guideGroups.length ? guideGroups : legacyGuideGroup ? [legacyGuideGroup] : [],
    };
  };
}

export function createPublicAdoptionPageReaderFromClient(client: SupabaseClient) {
  const documentRepository = createPublicDocumentRepository(client);
  return createPublicAdoptionPageReader({
    adoptionRepository: createSupabaseAdoptionInformationRepository(client),
    loadGuides: (slotKeys) => loadPublishedDocumentSlots(slotKeys, documentRepository),
  });
}

export async function loadPublicAdoptionPage() {
  try {
    return await createPublicAdoptionPageReaderFromClient(createSupabaseServiceClient())();
  } catch {
    throw new Error("Could not load adoption information");
  }
}
