import { getAppUrl } from "../appUrl.server";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
import { createContentService } from "./service";
import type { PublicStoriesPageData, PublicStorySummary } from "./publicStoriesPage.types";
import type { ContentSummary, PublicStoryMapPoint } from "./types";

export type { PublicStoriesPageData, PublicStorySummary } from "./publicStoriesPage.types";

type PublicStoriesPageSourceData = {
  items: ContentSummary[];
  total: number;
  points: PublicStoryMapPoint[];
};

type PublicStoriesPageService = {
  listPublicStoriesPage(input: unknown): Promise<PublicStoriesPageSourceData>;
};

type PublicStoriesPageServiceFactory = () => PublicStoriesPageService;

function projectPublicStory(item: ContentSummary): PublicStorySummary {
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
