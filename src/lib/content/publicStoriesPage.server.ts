import { getAppUrl } from "../appUrl.server";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
import { createContentService } from "./service";
import type { PublicStoriesPageData, PublicStorySummary } from "./publicStoriesPage.types";
import type { AnimalStoryType, ContentSummary, ContentType, PublicStoryMapPoint } from "./types";

export type { PublicStoriesPageData, PublicStorySummary } from "./publicStoriesPage.types";

type PublicStoriesPageSourceData = {
  items: ContentSummary[];
  total: number;
  points: PublicStoryMapPoint[];
};

type PublicStoriesPageQuery = {
  type?: ContentType;
  animalType?: AnimalStoryType;
  rescueRegion?: string;
  pageSize?: number;
};

type PublicStoriesPageService = {
  listPublicStoriesPage(input: PublicStoriesPageQuery): Promise<PublicStoriesPageSourceData>;
};

type PublicStoriesPageServiceFactory = () => PublicStoriesPageService;

type RelatedStorySource = {
  id: string;
  type: ContentType;
  storyProfile: { animalType: AnimalStoryType; rescueRegion: string } | null;
};

type RelatedStoriesService = PublicStoriesPageService & {
  getPublicContentBySlug(slug: string): Promise<RelatedStorySource | null>;
};

type RelatedStoriesServiceFactory = () => RelatedStoriesService;

const RELATED_STORIES_LIMIT = 3;

export function projectPublicStory(item: ContentSummary): PublicStorySummary {
  const profile = item.storyProfile;
  if (!profile) return { ...item, storyProfile: null };

  return {
    ...item,
    storyProfile: {
      contentItemId: profile.contentItemId,
      animalType: profile.animalType,
      publicStatus: profile.publicStatus,
      rescueRegion: profile.rescueRegion,
      rescueDate: profile.rescueDate,
      showOnMap: profile.showOnMap,
      publicMapLabel: profile.publicMapLabel,
      publicLat: profile.publicLat,
      publicLng: profile.publicLng,
      isFeatured: profile.isFeatured,
    },
  };
}

function projectPublicStoriesPage(data: PublicStoriesPageSourceData): PublicStoriesPageData {
  const publishedItems = data.items.filter((item) => item.status === "published");
  const publishedIds = new Set(publishedItems.map((item) => item.id));
  return {
    items: publishedItems.map(projectPublicStory),
    total: publishedItems.length === data.items.length ? data.total : publishedItems.length,
    points: data.points.filter((point) => publishedIds.has(point.id)),
  };
}

export function createPublicStoriesPageReader(service: PublicStoriesPageService) {
  return async (): Promise<PublicStoriesPageData> => {
    try {
      return projectPublicStoriesPage(await service.listPublicStoriesPage({}));
    } catch {
      throw new Error("Could not load stories");
    }
  };
}

function createPublicStoriesPageService() {
  const client = createSupabaseServiceClient();
  return createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: getAppUrl(),
  });
}

export async function loadPublicStoriesPage(
  createService: PublicStoriesPageServiceFactory = createPublicStoriesPageService,
) {
  try {
    return await createPublicStoriesPageReader(createService())();
  } catch {
    throw new Error("Could not load stories");
  }
}

export function createRelatedStoriesReader(service: RelatedStoriesService) {
  return async (slug: string): Promise<PublicStorySummary[]> => {
    const current = await service.getPublicContentBySlug(slug);
    if (!current || current.type !== "rescue_story" || !current.storyProfile) return [];

    const profile = current.storyProfile;
    const seen = new Set<string>([current.id]);
    const selected: ContentSummary[] = [];
    const append = (items: ContentSummary[]) => {
      for (const item of items) {
        if (selected.length >= RELATED_STORIES_LIMIT) return;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        selected.push(item);
      }
    };

    append(
      (
        await service.listPublicStoriesPage({
          type: "rescue_story",
          animalType: profile.animalType,
          pageSize: 6,
        })
      ).items,
    );

    if (selected.length < RELATED_STORIES_LIMIT && profile.rescueRegion) {
      append(
        (
          await service.listPublicStoriesPage({
            type: "rescue_story",
            rescueRegion: profile.rescueRegion,
            pageSize: 6,
          })
        ).items,
      );
    }

    return selected.map(projectPublicStory);
  };
}

export async function loadRelatedStories(
  slug: string,
  createService: RelatedStoriesServiceFactory = createPublicStoriesPageService,
): Promise<PublicStorySummary[]> {
  try {
    return await createRelatedStoriesReader(createService())(slug);
  } catch {
    return [];
  }
}
