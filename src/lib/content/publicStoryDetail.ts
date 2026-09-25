import type { PublicStorySummary } from "./publicStoriesPage.types";
import type { ContentDetail } from "./types";

type StoryDetailSources = {
  getStory(slug: string): Promise<ContentDetail | null>;
  getRelated(slug: string): Promise<PublicStorySummary[]>;
};

export function createStoryDetailReader({ getStory, getRelated }: StoryDetailSources) {
  return async (slug: string) => {
    const content = await getStory(slug);
    if (!content) return null;
    const related = content.type === "rescue_story" ? await getRelated(slug).catch(() => []) : [];
    return { content, related };
  };
}
