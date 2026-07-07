import type {
  AnimalStoryType,
  ContentSummary,
  RescuePublicStatus,
} from "../../../lib/content/types";

export type StoryCardFilters = {
  animalType?: AnimalStoryType | "all";
  publicStatus?: RescuePublicStatus | "all";
  rescueRegion?: string | "all";
};

export function publicStatusLabel(status: RescuePublicStatus) {
  const labels: Record<RescuePublicStatus, string> = {
    rescued: "已救援",
    medical_care: "醫療照護",
    foster_recovery: "暫托康復",
    ready_for_adoption: "準備領養",
    adopted: "已領養",
    sponsor_needed: "需要助養",
    closed: "已結案",
  };

  return labels[status];
}

export function filterStoryCards<T extends Pick<ContentSummary, "type" | "storyProfile">>(
  stories: T[],
  filters: StoryCardFilters,
) {
  return stories.filter((story) => {
    if (story.type !== "rescue_story" || !story.storyProfile) return false;

    const { storyProfile } = story;
    if (
      filters.animalType &&
      filters.animalType !== "all" &&
      storyProfile.animalType !== filters.animalType
    ) {
      return false;
    }

    if (
      filters.publicStatus &&
      filters.publicStatus !== "all" &&
      storyProfile.publicStatus !== filters.publicStatus
    ) {
      return false;
    }

    if (
      filters.rescueRegion &&
      filters.rescueRegion !== "all" &&
      storyProfile.rescueRegion !== filters.rescueRegion
    ) {
      return false;
    }

    return true;
  });
}
