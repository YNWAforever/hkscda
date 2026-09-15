import type {
  AnimalStoryType,
  ContentType,
  RescuePublicStatus,
  RescueStoryProfile,
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

type FilterableStory = {
  type: ContentType;
  storyProfile: Pick<RescueStoryProfile, "animalType" | "publicStatus" | "rescueRegion"> | null;
};

const animalTypeLabels: Record<AnimalStoryType, string> = {
  cat: "貓",
  dog: "狗",
  mixed: "貓狗",
  unknown: "未知",
};

export function animalTypeLabel(type: AnimalStoryType) {
  return animalTypeLabels[type];
}

function isSafeStoryHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const DEFAULT_STORY_CTA = { href: "/donate?purpose=medical", label: "支援醫療費用 ｜ 立即捐助" };

export function storyCta(story: { ctaLabel: string | null; ctaUrl: string | null }) {
  const href = story.ctaUrl?.trim();
  const label = story.ctaLabel?.trim();
  if (href && label && isSafeStoryHref(href)) return { href, label };
  return DEFAULT_STORY_CTA;
}

export function filterStoryCards<T extends FilterableStory>(
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
