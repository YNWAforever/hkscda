import type { ContentSummary, PublicStoryMapPoint, RescueStoryProfile } from "./types";

export type PublicRescueStoryProfile = Omit<
  RescueStoryProfile,
  "internalAddress" | "internalLocationNotes"
>;

export type PublicStorySummary = Omit<
  ContentSummary,
  "storyProfile" | "sourceReference" | "contentOwner"
> & {
  storyProfile: PublicRescueStoryProfile | null;
};

export type PublicStoriesPageData = {
  items: PublicStorySummary[];
  total: number;
  points: PublicStoryMapPoint[];
};
